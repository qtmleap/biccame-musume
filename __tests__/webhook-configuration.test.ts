import { expect, spyOn, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import adminRoutes from '@api/routes/admin/index'
import botRoutes from '@api/routes/admin-bot'
import {
  detectionConfiguration,
  EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
  EVENT_DETECTION_MODEL_KEY,
  EVENT_DETECTION_THRESHOLDS_KEY
} from '@api/services/webhook-config'
import type { Bindings } from '@api/types/bindings'
import {
  FIELD_THRESHOLD_KEYS,
  type FieldThresholds,
  resolveFieldThresholds
} from '@biccame/shared/event-detect/detection'
import {
  AdminBotConfigurationRequestSchema,
  AdminBotStatusSchema,
  type EventThresholds,
  EventThresholdsSchema
} from '@biccame/shared/schemas/admin-bot.dto'
import { OpenAPIHono } from '@hono/zod-openapi'
import { csrf } from 'hono/csrf'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const withKV = async (run: (env: Bindings) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-configuration-test',
      modules: true,
      script: 'export default { fetch(){return new Response("test")} }',
      compatibilityDate: '2026-05-11',
      kvNamespaces: ['BICCAME_MUSUME_EVENTS']
    })
  )
  try {
    await run(await mf.getBindings<Bindings>())
  } finally {
    await mf.dispose()
  }
}

const save = (model: unknown, env: object) =>
  botRoutes.request(
    '/admin/bot/configuration',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model)
    },
    env
  )
// 画面から送る body。項目ごとに値を変えて、キーの取り違えを検出できるようにする。
const editedThresholds: FieldThresholds = {
  status: 0.7,
  category: 0.92,
  store: 0.93,
  store_confirm: 0.74,
  character: 0.75,
  character_confirm: 0.76,
  start_date: 0.94,
  end_date: 0.95,
  quantity: 0.96,
  condition: 0.97,
  purchase_amount: 0.825,
  charge_amount: 0.98
}
// 判定全体の3つ。環境変数の既定値（90% / 50% / 90%）と全て違う値にして、上書きと取り違えを検出できるようにする。
const editedEventThresholds: EventThresholds = { eventThreshold: 0.92, ignoreThreshold: 0.4, choiceThreshold: 0.85 }
const configurationBody = (
  model: string,
  fieldThresholds: unknown = editedThresholds,
  thresholds: unknown = editedEventThresholds
) => ({ model, thresholds, fieldThresholds })

test('missing override uses environment bootstrap or clef default; valid override wins', async () => {
  await withKV(async (env) => {
    expect((await detectionConfiguration(env)).model).toBe('clef')
    expect((await detectionConfiguration({ ...env, EVENT_DETECTION_MODEL: 'clef-flash' })).model).toBe('clef-flash')
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, 'clef')
    expect((await detectionConfiguration({ ...env, EVENT_DETECTION_MODEL: 'clef-flash' })).model).toBe('clef')
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, 'clef-flash')
    expect((await detectionConfiguration(env)).model).toBe('clef-flash')
  })
})

test('invalid stored model warns without disclosing stored data and falls back to bootstrap', async () => {
  await withKV(async (env) => {
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, 'synthetic-invalid-private-value')
    const warning = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect((await detectionConfiguration({ ...env, EVENT_DETECTION_MODEL: 'clef-flash' })).model).toBe('clef-flash')
      expect((await detectionConfiguration(env)).model).toBe('clef')
      expect(warning).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(warning.mock.calls)).not.toContain('synthetic-invalid-private-value')
    } finally {
      warning.mockRestore()
    }
  })
})

test('save validates the exact payload before writing and never reads eventual KV back', async () => {
  const writes: unknown[] = []
  const env = {
    BICCAME_MUSUME_EVENTS: {
      get: async () => {
        throw new Error('Save must not read KV')
      },
      put: async (key: string, value: string) => {
        writes.push([key, value])
      }
    }
  }
  const { status: _status, ...withoutStatus } = editedThresholds
  const { choiceThreshold: _choice, ...eventWithoutChoice } = editedEventThresholds
  const invalid: unknown[] = [
    { model: 'other', thresholds: editedEventThresholds, fieldThresholds: editedThresholds },
    { ...configurationBody('clef'), extra: true },
    {},
    { model: null, thresholds: editedEventThresholds, fieldThresholds: editedThresholds },
    // しきい値が無い・モデルだけの旧形式は受け付けない。
    { model: 'clef' },
    { model: 'clef', fieldThresholds: null },
    { model: 'clef', fieldThresholds: {} },
    // 項目別だけを送る旧形式（判定全体の3つが無い）は受け付けない。
    { model: 'clef', fieldThresholds: editedThresholds },
    { model: 'clef', thresholds: null, fieldThresholds: editedThresholds },
    { model: 'clef', thresholds: {}, fieldThresholds: editedThresholds },
    // 判定全体の3つの不正: 欠け・余分なキー・範囲外・文字列・順序違反。
    configurationBody('clef', editedThresholds, eventWithoutChoice),
    configurationBody('clef', editedThresholds, { ...editedEventThresholds, extra: 0.9 }),
    configurationBody('clef', editedThresholds, { ...editedEventThresholds, eventThreshold: 0 }),
    configurationBody('clef', editedThresholds, { ...editedEventThresholds, eventThreshold: 1.1 }),
    configurationBody('clef', editedThresholds, { ...editedEventThresholds, choiceThreshold: 0 }),
    configurationBody('clef', editedThresholds, { ...editedEventThresholds, choiceThreshold: 1.1 }),
    configurationBody('clef', editedThresholds, { ...editedEventThresholds, ignoreThreshold: -0.1 }),
    configurationBody('clef', editedThresholds, { ...editedEventThresholds, ignoreThreshold: 1.1 }),
    configurationBody('clef', editedThresholds, { ...editedEventThresholds, eventThreshold: '0.9' }),
    configurationBody('clef', editedThresholds, { ...editedEventThresholds, ignoreThreshold: null }),
    configurationBody('clef', editedThresholds, {
      ...editedEventThresholds,
      eventThreshold: 0.4,
      ignoreThreshold: 0.4
    }),
    configurationBody('clef', editedThresholds, {
      ...editedEventThresholds,
      eventThreshold: 0.4,
      ignoreThreshold: 0.5
    }),
    configurationBody('clef', withoutStatus),
    configurationBody('clef', { ...editedThresholds, extra: 0.9 }),
    configurationBody('clef', { ...editedThresholds, status: 0 }),
    configurationBody('clef', { ...editedThresholds, status: 1.1 }),
    configurationBody('clef', { ...editedThresholds, status: -0.1 }),
    configurationBody('clef', { ...editedThresholds, status: '0.9' }),
    configurationBody('clef', { ...editedThresholds, status: null })
  ]
  for (const payload of invalid) {
    expect((await save(payload, env)).status, JSON.stringify(payload)).toBe(400)
  }
  expect(writes).toHaveLength(0)
  for (const model of ['clef', 'clef-flash']) {
    const response = await save(configurationBody(model), env)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body: unknown = await response.json()
    expect(body).toEqual({ model, thresholds: editedEventThresholds, fieldThresholds: editedThresholds })
  }
  // 判定全体の3つ → 項目別 → モデルの順に、3回の put をする。
  expect(writes).toEqual([
    [EVENT_DETECTION_THRESHOLDS_KEY, JSON.stringify(editedEventThresholds)],
    [EVENT_DETECTION_FIELD_THRESHOLDS_KEY, JSON.stringify(editedThresholds)],
    [EVENT_DETECTION_MODEL_KEY, 'clef'],
    [EVENT_DETECTION_THRESHOLDS_KEY, JSON.stringify(editedEventThresholds)],
    [EVENT_DETECTION_FIELD_THRESHOLDS_KEY, JSON.stringify(editedThresholds)],
    [EVENT_DETECTION_MODEL_KEY, 'clef-flash']
  ])
  // 上限の 1 とごく小さい値も受け付ける。
  const boundary = Object.fromEntries(FIELD_THRESHOLD_KEYS.map((key) => [key, key === 'status' ? 0.001 : 1]))
  expect((await save(configurationBody('clef', boundary), env)).status).toBe(200)
  // 対象外の 0 と、登録・必須項目の上限 1 も受け付ける。
  const eventBoundary = { eventThreshold: 1, ignoreThreshold: 0, choiceThreshold: 1 }
  expect((await save(configurationBody('clef', editedThresholds, eventBoundary), env)).status).toBe(200)
  const smallest = { eventThreshold: 0.001, ignoreThreshold: 0, choiceThreshold: 0.001 }
  expect((await save(configurationBody('clef', editedThresholds, smallest), env)).status).toBe(200)
})

test('thresholds in the request is required: the previous request shape is rejected by the strict schema', () => {
  // thresholds を含まない旧形式は strictObject の必須違反。含めれば通る。
  const previous = { model: 'clef', fieldThresholds: editedThresholds }
  expect(AdminBotConfigurationRequestSchema.safeParse(previous).success).toBe(false)
  expect(AdminBotConfigurationRequestSchema.safeParse(configurationBody('clef')).success).toBe(true)
})

test('EventThresholdsSchema requires every key and ignoreThreshold strictly below eventThreshold', () => {
  const valid = [
    editedEventThresholds,
    { eventThreshold: 0.9, ignoreThreshold: 0, choiceThreshold: 0.9 },
    { eventThreshold: 1, ignoreThreshold: 0.999, choiceThreshold: 1 }
  ]
  for (const value of valid) expect(EventThresholdsSchema.safeParse(value).success, JSON.stringify(value)).toBe(true)
  const invalid = [
    {},
    { eventThreshold: 0.9, ignoreThreshold: 0.5 },
    { ...editedEventThresholds, extra: 1 },
    // 同値は不可（環境変数の規則と同じ）。
    { eventThreshold: 0.5, ignoreThreshold: 0.5, choiceThreshold: 0.9 },
    { eventThreshold: 0.4, ignoreThreshold: 0.5, choiceThreshold: 0.9 },
    { eventThreshold: 0, ignoreThreshold: 0, choiceThreshold: 0.9 },
    { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0 },
    { eventThreshold: 0.9, ignoreThreshold: -0.1, choiceThreshold: 0.9 },
    { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: Number.NaN },
    { eventThreshold: '0.9', ignoreThreshold: 0.5, choiceThreshold: 0.9 }
  ]
  for (const value of invalid) expect(EventThresholdsSchema.safeParse(value).success, JSON.stringify(value)).toBe(false)
})

test('any put failing returns 503; event thresholds, then field thresholds, are written before the model', async () => {
  const writes: string[] = []
  const envFailingOn = (failing: string) => ({
    BICCAME_MUSUME_EVENTS: {
      put: async (key: string) => {
        if (key === failing) throw new Error('synthetic-private-put-error')
        writes.push(key)
      }
    }
  })
  const eventFail = await save(configurationBody('clef-flash'), envFailingOn(EVENT_DETECTION_THRESHOLDS_KEY))
  expect(eventFail.status).toBe(503)
  const eventBody: unknown = await eventFail.json()
  expect(eventBody).toEqual({ error: 'configuration_unavailable' })
  // 判定全体の3つの書き込みに失敗したら、後ろの項目別としきい値もモデルも書かない。
  expect(writes).toEqual([])
  const thresholdsFail = await save(configurationBody('clef-flash'), envFailingOn(EVENT_DETECTION_FIELD_THRESHOLDS_KEY))
  expect(thresholdsFail.status).toBe(503)
  const thresholdsBody: unknown = await thresholdsFail.json()
  expect(thresholdsBody).toEqual({ error: 'configuration_unavailable' })
  // 項目別の書き込みに失敗したら、モデルは書かない（3つは先に書き込み済み）。
  expect(writes).toEqual([EVENT_DETECTION_THRESHOLDS_KEY])
  writes.length = 0
  const modelFail = await save(configurationBody('clef-flash'), envFailingOn(EVENT_DETECTION_MODEL_KEY))
  expect(modelFail.status).toBe(503)
  const modelBody: unknown = await modelFail.json()
  expect(modelBody).toEqual({ error: 'configuration_unavailable' })
  // モデルの書き込みだけ失敗した場合、2種類のしきい値は先に書き込み済み（3回の put は原子的ではない）。
  expect(writes).toEqual([EVENT_DETECTION_THRESHOLDS_KEY, EVENT_DETECTION_FIELD_THRESHOLDS_KEY])
})

test('field thresholds default from the common threshold, and stored values replace them', async () => {
  await withKV(async (env) => {
    const warning = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // 未保存: status は min(共通値, 0.8)、他は共通値。
      const defaults = await detectionConfiguration(env)
      expect(defaults.choiceThreshold).toBe(0.9)
      expect(defaults.fieldThresholds).toEqual(resolveFieldThresholds(0.9))
      expect(defaults.fieldThresholds.status).toBe(0.8)
      expect(defaults.fieldThresholds.category).toBe(0.9)
      expect(warning).not.toHaveBeenCalled()
      // 共通値（環境変数）が変わると status 以外の既定値が追従する。
      const raised = await detectionConfiguration({ ...env, EVENT_DETECTION_CHOICE_THRESHOLD: '0.95' })
      expect(raised.choiceThreshold).toBe(0.95)
      expect(raised.fieldThresholds).toEqual({ ...resolveFieldThresholds(0.95), status: 0.8 })
      expect(raised.fieldThresholds.category).toBe(0.95)
      const lowered = await detectionConfiguration({ ...env, EVENT_DETECTION_CHOICE_THRESHOLD: '0.7' })
      expect(lowered.fieldThresholds).toEqual(resolveFieldThresholds(0.7))
      expect(lowered.fieldThresholds.status).toBe(0.7)
      // 保存済み: 8項目の値をそのまま使う。共通値や既存の設定は変えない。
      await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, JSON.stringify(editedThresholds))
      const stored = await detectionConfiguration({ ...env, EVENT_DETECTION_CHOICE_THRESHOLD: '0.95' })
      expect(stored.fieldThresholds).toEqual(editedThresholds)
      expect(stored.choiceThreshold).toBe(0.95)
      expect(stored.eventThreshold).toBe(0.9)
      expect(stored.ignoreThreshold).toBe(0.5)
      expect(stored.model).toBe('clef')
      expect(warning).not.toHaveBeenCalled()
    } finally {
      warning.mockRestore()
    }
  })
})

test('invalid stored field thresholds warn without disclosing stored data and fall back to defaults', async () => {
  await withKV(async (env) => {
    const { status: _status, ...withoutStatus } = editedThresholds
    const invalid = [
      'synthetic-private-not-json{',
      '"synthetic-private-string"',
      'null',
      '[]',
      JSON.stringify({}),
      JSON.stringify(withoutStatus),
      JSON.stringify({ ...editedThresholds, status: 0 }),
      JSON.stringify({ ...editedThresholds, status: 1.5 }),
      JSON.stringify({ ...editedThresholds, extra: 0.9 })
    ]
    const warning = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      for (const [index, value] of invalid.entries()) {
        await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, value)
        const result = await detectionConfiguration(env)
        expect(result.fieldThresholds, value).toEqual(resolveFieldThresholds(0.9))
        expect(warning).toHaveBeenCalledTimes(index + 1)
      }
      expect(JSON.stringify(warning.mock.calls)).not.toContain('synthetic-private')
      expect(
        warning.mock.calls.every(
          (call) => call[0] === 'Invalid stored event detection field thresholds; using defaults'
        )
      ).toBe(true)
    } finally {
      warning.mockRestore()
    }
  })
})

test('stored event thresholds override the environment values; unsaved ones follow the environment', async () => {
  await withKV(async (env) => {
    const warning = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const overridden = { ...env, EVENT_DETECTION_THRESHOLD: '0.95', EVENT_DETECTION_IGNORE_THRESHOLD: '0.3' }
      // 未保存: 環境変数の値（読み取りは KV に書かない）。
      const before = await detectionConfiguration({ ...overridden, EVENT_DETECTION_CHOICE_THRESHOLD: '0.97' })
      expect(before).toMatchObject({ eventThreshold: 0.95, ignoreThreshold: 0.3, choiceThreshold: 0.97 })
      expect(await env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_THRESHOLDS_KEY, 'text')).toBeNull()
      // 保存済み: 3つとも環境変数ではなく保存値を使う。モデルなど他の設定は変えない。
      await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_THRESHOLDS_KEY, JSON.stringify(editedEventThresholds))
      const after = await detectionConfiguration({ ...overridden, EVENT_DETECTION_CHOICE_THRESHOLD: '0.97' })
      expect(after).toMatchObject(editedEventThresholds)
      expect(after.model).toBe('clef')
      // 環境変数が不正でも、保存値が有効ならその3つで動く。
      const brokenEnv = await detectionConfiguration({ ...env, EVENT_DETECTION_THRESHOLD: 'invalid' })
      expect(brokenEnv).toMatchObject(editedEventThresholds)
      // 対象外の 0 も保存値として有効。
      const zero = { eventThreshold: 0.8, ignoreThreshold: 0, choiceThreshold: 0.7 }
      await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_THRESHOLDS_KEY, JSON.stringify(zero))
      expect(await detectionConfiguration(env)).toMatchObject(zero)
      expect(warning).not.toHaveBeenCalled()
    } finally {
      warning.mockRestore()
    }
  })
})

test('invalid stored event thresholds warn without disclosing stored data and fall back to the environment', async () => {
  await withKV(async (env) => {
    const { eventThreshold: _event, ...withoutEvent } = editedEventThresholds
    const invalid = [
      'synthetic-private-not-json{',
      '"synthetic-private-string"',
      'null',
      '[]',
      JSON.stringify({}),
      JSON.stringify(withoutEvent),
      JSON.stringify({ ...editedEventThresholds, extra: 0.9 }),
      JSON.stringify({ ...editedEventThresholds, eventThreshold: 0 }),
      JSON.stringify({ ...editedEventThresholds, choiceThreshold: 1.5 }),
      JSON.stringify({ ...editedEventThresholds, ignoreThreshold: -0.1 }),
      JSON.stringify({ ...editedEventThresholds, eventThreshold: '0.92' }),
      // 対象外が登録以上の保存値（同値を含む）は環境変数に戻す。
      JSON.stringify({ eventThreshold: 0.4, ignoreThreshold: 0.5, choiceThreshold: 0.9 }),
      JSON.stringify({ eventThreshold: 0.5, ignoreThreshold: 0.5, choiceThreshold: 0.9 })
    ]
    const warning = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      for (const [index, value] of invalid.entries()) {
        await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_THRESHOLDS_KEY, value)
        const result = await detectionConfiguration(env)
        // wrangler.toml 相当の既定値（90% / 50% / 90%）に戻る。
        expect(result, value).toMatchObject({ eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 })
        expect(warning).toHaveBeenCalledTimes(index + 1)
      }
      expect(JSON.stringify(warning.mock.calls)).not.toContain('synthetic-private')
      expect(
        warning.mock.calls.every(
          (call) => call[0] === 'Invalid stored event detection thresholds; using environment configuration'
        )
      ).toBe(true)
      // 環境変数の値があれば、その値に戻る。
      const result = await detectionConfiguration({ ...env, EVENT_DETECTION_THRESHOLD: '0.95' })
      expect(result.eventThreshold).toBe(0.95)
    } finally {
      warning.mockRestore()
    }
  })
})

test('without saved field thresholds the defaults follow the stored choice threshold, not the environment', async () => {
  await withKV(async (env) => {
    const warning = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // 項目別が未保存で、3つだけ保存済み: 項目別の既定値は保存した choiceThreshold（0.7）から決まる。
      const stored = { eventThreshold: 0.92, ignoreThreshold: 0.4, choiceThreshold: 0.7 }
      await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_THRESHOLDS_KEY, JSON.stringify(stored))
      const result = await detectionConfiguration({ ...env, EVENT_DETECTION_CHOICE_THRESHOLD: '0.99' })
      expect(result.choiceThreshold).toBe(0.7)
      expect(result.fieldThresholds).toEqual(resolveFieldThresholds(0.7))
      expect(result.fieldThresholds.status).toBe(0.7)
      expect(result.fieldThresholds.category).toBe(0.7)
      // 共通値が 0.8 を超えるときも、status の既定値は 0.8 で頭打ち。
      const high = { eventThreshold: 0.99, ignoreThreshold: 0.4, choiceThreshold: 0.95 }
      await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_THRESHOLDS_KEY, JSON.stringify(high))
      const raised = await detectionConfiguration(env)
      expect(raised.fieldThresholds).toEqual({ ...resolveFieldThresholds(0.95), status: 0.8 })
      expect(raised.fieldThresholds.category).toBe(0.95)
      // 項目別が保存済みなら項目別が優先され、3つの保存値は影響しない（choiceThreshold だけが別に出る）。
      await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, JSON.stringify(editedThresholds))
      const both = await detectionConfiguration(env)
      expect(both.fieldThresholds).toEqual(editedThresholds)
      expect(both.choiceThreshold).toBe(0.95)
      // 3つの保存値が壊れているときは、環境変数の choiceThreshold から既定値を決める（項目別も未保存の場合）。
      await env.BICCAME_MUSUME_EVENTS.delete(EVENT_DETECTION_FIELD_THRESHOLDS_KEY)
      await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_THRESHOLDS_KEY, 'synthetic-private-not-json{')
      const fallback = await detectionConfiguration({ ...env, EVENT_DETECTION_CHOICE_THRESHOLD: '0.6' })
      expect(fallback.choiceThreshold).toBe(0.6)
      expect(fallback.fieldThresholds).toEqual(resolveFieldThresholds(0.6))
      // 読み取りでは KV に書かない。
      expect(await env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, 'text')).toBeNull()
    } finally {
      warning.mockRestore()
    }
  })
})

test('status response carries the effective field thresholds, defaults first and saved values after', async () => {
  await withKV(async (env) => {
    const read = async () => {
      const response = await botRoutes.request('/admin/bot/status', { method: 'GET' }, env)
      expect(response.status).toBe(200)
      const parsed = AdminBotStatusSchema.safeParse(await response.json())
      if (!parsed.success) throw new Error('Invalid status response')
      return parsed.data.webhook
    }
    const before = await read()
    expect(before.choiceThreshold).toBe(0.9)
    expect(before.fieldThresholds).toEqual(resolveFieldThresholds(0.9))
    const response = await save(configurationBody('clef-flash'), env)
    expect(response.status).toBe(200)
    expect(before).toMatchObject({ eventThreshold: 0.9, ignoreThreshold: 0.5 })
    const after = await read()
    expect(after.fieldThresholds).toEqual(editedThresholds)
    expect(after.model).toBe('clef-flash')
    // 判定全体の3つは、保存した値に変わる（環境変数の値ではなくなる）。
    expect(after).toMatchObject(editedEventThresholds)
    // 保存したキーは KV に8項目の JSON で入る。
    const raw = await env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, 'text')
    expect(raw).toBe(JSON.stringify(editedThresholds))
    expect(await env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_THRESHOLDS_KEY, 'text')).toBe(
      JSON.stringify(editedEventThresholds)
    )
    expect(await env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_MODEL_KEY, 'text')).toBe('clef-flash')
  })
})

test('KV read/write errors and missing mandatory binding fail safely rather than using default', async () => {
  const env = {
    BICCAME_MUSUME_EVENTS: {
      get: async () => {
        throw new Error('synthetic-private-get-error')
      },
      put: async () => {
        throw new Error('synthetic-private-put-error')
      }
    }
  }
  for (const environment of [env, {}]) {
    for (const path of ['/admin/bot/status', '/admin/bot/connection']) {
      const response = await botRoutes.request(
        path,
        { method: path.endsWith('/connection') ? 'POST' : 'GET' },
        environment
      )
      expect(response.status).toBe(503)
      const body: unknown = await response.json()
      expect(body).toEqual({ error: 'configuration_unavailable' })
    }
    const response = await save(configurationBody('clef-flash'), environment)
    expect(response.status).toBe(503)
    const body: unknown = await response.json()
    expect(body).toEqual({ error: 'configuration_unavailable' })
  }
})

test('configuration mutation remains protected by Cloudflare Access and CSRF middleware', async () => {
  const writes: string[] = []
  const env = {
    ENVIRONMENT: 'prod',
    BICCAME_MUSUME_EVENTS: {
      put: async () => {
        writes.push('write')
      }
    }
  }
  const response = await adminRoutes.request(
    '/admin/bot/configuration',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configurationBody('clef-flash'))
    },
    env
  )
  expect(response.status).toBe(401)
  const app = new OpenAPIHono<{ Bindings: Bindings }>()
  app.use('/api/*', csrf())
  app.route('/api', adminRoutes)
  const rejected = await app.request(
    'https://app.example.invalid/api/admin/bot/configuration',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Sec-Fetch-Site': 'cross-site',
        Origin: 'https://attacker.example.invalid'
      },
      body: JSON.stringify(configurationBody('clef-flash'))
    },
    { ...env, ENVIRONMENT: 'local' }
  )
  expect(rejected.status).toBe(403)
  expect(writes).toHaveLength(0)
  const entrypoint = await readFile('workers/web/src/index.ts', 'utf8')
  expect(entrypoint).toContain("app.use('/api/*'")
  expect(entrypoint).toContain('return csrfProtection(c, next)')
  expect(entrypoint).not.toContain("c.req.path === '/api/admin/bot/configuration'")
})

test('旧single_eventだけを取り除き、他の8項目を保って保存時に新形式へ移行する', async () => {
  await withKV(async (env) => {
    const legacy = { ...editedThresholds, single_event: 0.55 }
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, JSON.stringify(legacy))
    const writes: [string, string][] = []
    const configurationEnv = Object.assign({}, env, {
      BICCAME_MUSUME_EVENTS: {
        get: (key: string) => env.BICCAME_MUSUME_EVENTS.get(key, 'text'),
        put: async (key: string, value: string) => {
          writes.push([key, value])
          await env.BICCAME_MUSUME_EVENTS.put(key, value)
        }
      }
    })
    expect((await detectionConfiguration(configurationEnv)).fieldThresholds).toEqual(editedThresholds)
    expect(writes).toHaveLength(0)
    expect((await save(configurationBody('clef'), configurationEnv)).status).toBe(200)
    const saved = writes.find(([key]) => key === EVENT_DETECTION_FIELD_THRESHOLDS_KEY)
    if (saved === undefined) throw new Error('Expected thresholds write')
    expect(JSON.parse(saved[1])).toEqual(editedThresholds)
  })
})
