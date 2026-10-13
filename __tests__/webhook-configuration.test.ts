import { expect, spyOn, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import adminRoutes from '@api/routes/admin/index'
import botRoutes from '@api/routes/admin-bot'
import {
  detectionConfiguration,
  EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
  EVENT_DETECTION_MODEL_KEY
} from '@api/services/webhook-config'
import type { Bindings } from '@api/types/bindings'
import {
  FIELD_THRESHOLD_KEYS,
  type FieldThresholds,
  resolveFieldThresholds
} from '@biccame/shared/event-detect/detection'
import { AdminBotStatusSchema } from '@biccame/shared/schemas/admin-bot.dto'
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
  single_event: 0.91,
  status: 0.7,
  category: 0.92,
  store: 0.93,
  start_date: 0.94,
  end_date: 0.95,
  quantity: 0.96,
  condition: 0.97,
  purchase_amount: 0.825
}
const configurationBody = (model: string, fieldThresholds: unknown = editedThresholds) => ({ model, fieldThresholds })

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
  const invalid: unknown[] = [
    { model: 'other', fieldThresholds: editedThresholds },
    { ...configurationBody('clef'), extra: true },
    {},
    { model: null, fieldThresholds: editedThresholds },
    // しきい値が無い・モデルだけの旧形式は受け付けない。
    { model: 'clef' },
    { model: 'clef', fieldThresholds: null },
    { model: 'clef', fieldThresholds: {} },
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
    expect(body).toEqual({ model, fieldThresholds: editedThresholds })
  }
  // しきい値 → モデルの順に、2回の put をする。
  expect(writes).toEqual([
    [EVENT_DETECTION_FIELD_THRESHOLDS_KEY, JSON.stringify(editedThresholds)],
    [EVENT_DETECTION_MODEL_KEY, 'clef'],
    [EVENT_DETECTION_FIELD_THRESHOLDS_KEY, JSON.stringify(editedThresholds)],
    [EVENT_DETECTION_MODEL_KEY, 'clef-flash']
  ])
  // 上限の 1 とごく小さい値も受け付ける。
  const boundary = Object.fromEntries(FIELD_THRESHOLD_KEYS.map((key) => [key, key === 'status' ? 0.001 : 1]))
  expect((await save(configurationBody('clef', boundary), env)).status).toBe(200)
})

test('either put failing returns 503; thresholds are written before the model', async () => {
  const writes: string[] = []
  const envFailingOn = (failing: string) => ({
    BICCAME_MUSUME_EVENTS: {
      put: async (key: string) => {
        if (key === failing) throw new Error('synthetic-private-put-error')
        writes.push(key)
      }
    }
  })
  const thresholdsFail = await save(configurationBody('clef-flash'), envFailingOn(EVENT_DETECTION_FIELD_THRESHOLDS_KEY))
  expect(thresholdsFail.status).toBe(503)
  const thresholdsBody: unknown = await thresholdsFail.json()
  expect(thresholdsBody).toEqual({ error: 'configuration_unavailable' })
  // しきい値の書き込みに失敗したら、モデルは書かない。
  expect(writes).toEqual([])
  const modelFail = await save(configurationBody('clef-flash'), envFailingOn(EVENT_DETECTION_MODEL_KEY))
  expect(modelFail.status).toBe(503)
  const modelBody: unknown = await modelFail.json()
  expect(modelBody).toEqual({ error: 'configuration_unavailable' })
  // モデルの書き込みだけ失敗した場合、しきい値は先に書き込み済み（2回の put は原子的ではない）。
  expect(writes).toEqual([EVENT_DETECTION_FIELD_THRESHOLDS_KEY])
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
      // 保存済み: 9項目の値をそのまま使う。共通値や既存の設定は変えない。
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
    const after = await read()
    expect(after.fieldThresholds).toEqual(editedThresholds)
    expect(after.model).toBe('clef-flash')
    // 共通値の表示は環境変数由来のまま。
    expect(after.choiceThreshold).toBe(0.9)
    // 保存したキーは KV に9項目の JSON で入る。
    const raw = await env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, 'text')
    expect(raw).toBe(JSON.stringify(editedThresholds))
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
