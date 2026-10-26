import { expect, test } from 'bun:test'
import botRoutes from '@api/routes/admin-bot'
import {
  detectionConfiguration,
  EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
  EVENT_DETECTION_THRESHOLDS_KEY
} from '@api/services/webhook-config'
import type { Bindings } from '@api/types/bindings'
import { FIELD_THRESHOLD_KEYS, FieldThresholdsSchema } from '@biccame/shared/event-detect/detection'
import { AdminBotStatusSchema } from '@biccame/shared/schemas/admin-bot.dto'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { z } from 'zod'

// 項目別のしきい値は 12 キー。KV の保存済みの設定（旧 8 キー、旧 9 キー + single_event）と、古い PWA が 8 キーで送る保存リクエストが、
// そのまま読める・通ること。新しい 4 キー（store_confirm・character・character_confirm・charge_amount）は保存・リクエストでは任意で、状態は常に全キーを返す。
const withKV = async (run: (env: Bindings) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-field-thresholds-compat-test',
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
const post = (path: string, body: unknown, env: object) =>
  botRoutes.request(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    env
  )
// 本番の KV に実際に入っている形（旧 8 キー。店舗は 0.9）。
const legacy8 = {
  status: 0.8,
  category: 0.85,
  store: 0.9,
  start_date: 0.9,
  end_date: 0.9,
  quantity: 0.9,
  condition: 0.9,
  purchase_amount: 0.9
}
const eventThresholds = { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 }
const storedFieldThresholds = async (env: Bindings): Promise<unknown> => {
  const raw = await env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, 'text')
  if (raw === null) throw new Error('Missing stored field thresholds')
  return JSON.parse(raw)
}
// 応答の fieldThresholds を取り出す（as を使わず、全キーのスキーマで検証する）。
const responseFieldThresholds = async (response: Response) => {
  const body = z.object({ fieldThresholds: FieldThresholdsSchema }).safeParse(await response.json())
  if (!body.success) throw new Error('Invalid configuration response')
  return body.data.fieldThresholds
}
const statusOf = async (env: Bindings) => {
  const response = await botRoutes.request('/admin/bot/status', { method: 'GET' }, env)
  expect(response.status).toBe(200)
  const parsed = AdminBotStatusSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('Invalid status response')
  return parsed.data.webhook
}

test('旧 8 キーの保存データが読める: 保存した値（店舗 0.9）はそのまま、新しいキーは既定値（店舗・娘の確認と娘は 0.7、入金額は共通値）', async () => {
  await withKV(async (env) => {
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, JSON.stringify(legacy8))
    const configuration = await detectionConfiguration(env)
    expect(configuration.fieldThresholds).toEqual({
      ...legacy8,
      store_confirm: 0.7,
      character: 0.7,
      character_confirm: 0.7,
      charge_amount: 0.9
    })
    expect(FieldThresholdsSchema.safeParse(configuration.fieldThresholds).success).toBe(true)
    expect(Object.keys(configuration.fieldThresholds).sort()).toEqual([...FIELD_THRESHOLD_KEYS].sort())
    // 状態の API も常に全 12 キーを返す。
    expect((await statusOf(env)).fieldThresholds).toEqual(configuration.fieldThresholds)
    // 共通値（保存した choiceThreshold）が変わると、charge_amount の既定だけが追従する。店舗・娘の 4 項目は共通値に依らない。
    await env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_THRESHOLDS_KEY,
      JSON.stringify({ eventThreshold: 0.95, ignoreThreshold: 0.5, choiceThreshold: 0.6 })
    )
    expect((await detectionConfiguration(env)).fieldThresholds).toMatchObject({
      store: 0.9,
      store_confirm: 0.7,
      character: 0.7,
      character_confirm: 0.7,
      charge_amount: 0.6
    })
  })
})

test('旧 9 キー（旧 8 キー + single_event）の保存データも読める。single_event だけを取り除く移行が、新しいキー構成でも動き続ける', async () => {
  await withKV(async (env) => {
    await env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
      JSON.stringify({ ...legacy8, single_event: 0.55 })
    )
    const configuration = await detectionConfiguration(env)
    expect(configuration.fieldThresholds).toMatchObject(legacy8)
    expect(configuration.fieldThresholds).not.toHaveProperty('single_event')
    expect(Object.keys(configuration.fieldThresholds).sort()).toEqual([...FIELD_THRESHOLD_KEYS].sort())
    // 新しいキーを含む保存データ + single_event も同じ。
    await env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
      JSON.stringify({
        ...legacy8,
        store_confirm: 0.5,
        character: 0.6,
        character_confirm: 0.65,
        charge_amount: 0.4,
        single_event: 0.55
      })
    )
    expect((await detectionConfiguration(env)).fieldThresholds).toMatchObject({
      store_confirm: 0.5,
      character: 0.6,
      character_confirm: 0.65,
      charge_amount: 0.4
    })
    // single_event 以外の未知のキーは不正（既定値に戻す）。
    await env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
      JSON.stringify({ ...legacy8, extra: 0.5 })
    )
    const fallback = await detectionConfiguration(env)
    expect(fallback.fieldThresholds.store).toBe(0.7)
  })
})

test('古いクライアントが 8 キーで保存しても 400 にしない。応答は常に全 12 キー（足りないキーは既定値）で、次に状態を読んだときと同じ', async () => {
  await withKV(async (env) => {
    const response = await post(
      '/admin/bot/configuration',
      { model: 'clef', thresholds: eventThresholds, fieldThresholds: legacy8 },
      env
    )
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(body).toEqual({
      model: 'clef',
      thresholds: eventThresholds,
      fieldThresholds: { ...legacy8, store_confirm: 0.7, character: 0.7, character_confirm: 0.7, charge_amount: 0.9 }
    })
    // 保存は送られたキーだけ（上書きしたキーだけ）。読み戻すと全キーになる。
    expect(await storedFieldThresholds(env)).toEqual(legacy8)
    expect((await statusOf(env)).fieldThresholds).toEqual({
      ...legacy8,
      store_confirm: 0.7,
      character: 0.7,
      character_confirm: 0.7,
      charge_amount: 0.9
    })
  })
})

test('12 キーで保存すると、新しいキーも保存され、状態で読み戻せる。保存リクエストの新しいキーが範囲外なら 400', async () => {
  await withKV(async (env) => {
    const twelve = {
      ...legacy8,
      store: 0.8,
      store_confirm: 0.5,
      character: 0.6,
      character_confirm: 0.55,
      charge_amount: 0.45
    }
    const response = await post(
      '/admin/bot/configuration',
      { model: 'clef-flash', thresholds: eventThresholds, fieldThresholds: twelve },
      env
    )
    expect(response.status).toBe(200)
    expect(await responseFieldThresholds(response)).toEqual(twelve)
    expect((await statusOf(env)).fieldThresholds).toEqual(twelve)
    for (const invalid of [
      { ...twelve, character: 0 },
      { ...twelve, store_confirm: 1.1 },
      { ...twelve, charge_amount: '0.5' },
      { ...twelve, extra: 0.5 },
      { ...twelve, single_event: 0.5 }
    ]) {
      const rejected = await post(
        '/admin/bot/configuration',
        { model: 'clef', thresholds: eventThresholds, fieldThresholds: invalid },
        env
      )
      expect(rejected.status, JSON.stringify(invalid)).toBe(400)
    }
  })
})
