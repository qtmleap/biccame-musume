import { expect, test } from 'bun:test'
import botRoutes from '@api/routes/admin-bot'
import {
  detectionConfiguration,
  EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
  EVENT_DETECTION_THRESHOLDS_KEY,
  webhookConfiguration
} from '@api/services/webhook-config'
import type { Bindings } from '@api/types/bindings'
import { resolveFieldThresholds } from '@biccame/shared/event-detect/detection'
import { DEFAULT_ITEM_COUNT_THRESHOLD } from '@biccame/shared/event-detect/extraction'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const withKV = async (run: (env: Bindings) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-item-count-threshold-test',
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

test('件数監査のしきい値は未設定なら 0.9、共有の既定値と一致する', async () => {
  await withKV(async (env) => {
    expect(DEFAULT_ITEM_COUNT_THRESHOLD).toBe(0.9)
    expect((await detectionConfiguration(env)).itemCountThreshold).toBe(DEFAULT_ITEM_COUNT_THRESHOLD)
    expect((await webhookConfiguration(env)).itemCountThreshold).toBe(DEFAULT_ITEM_COUNT_THRESHOLD)
  })
})

test('件数監査のしきい値は環境変数で上書きでき、有効範囲は (0, 1]', async () => {
  await withKV(async (env) => {
    for (const [value, expected] of [
      ['0.8', 0.8],
      ['0.95', 0.95],
      ['1', 1],
      ['0.001', 0.001]
    ] as const) {
      const configuration = await detectionConfiguration({ ...env, EVENT_DETECTION_ITEM_COUNT_THRESHOLD: value })
      expect(configuration.itemCountThreshold, value).toBe(expected)
      expect(
        (await webhookConfiguration({ ...env, EVENT_DETECTION_ITEM_COUNT_THRESHOLD: value })).itemCountThreshold
      ).toBe(expected)
    }
  })
})

test('件数監査のしきい値が不正なら、既存のしきい値と同じ設定エラーで失敗する', async () => {
  await withKV(async (env) => {
    for (const value of ['0', '-0.1', '1.1', 'abc', 'NaN', '']) {
      const invalid = { ...env, EVENT_DETECTION_ITEM_COUNT_THRESHOLD: value }
      await expect(detectionConfiguration(invalid), value).rejects.toThrow('Invalid event detection configuration')
      await expect(webhookConfiguration(invalid), value).rejects.toThrow('Invalid event detection configuration')
    }
  })
})

test('選択肢の共通しきい値（環境変数）を変えても件数監査のしきい値は動かない', async () => {
  await withKV(async (env) => {
    for (const choice of ['0.5', '0.7', '0.95', '1']) {
      const configuration = await detectionConfiguration({ ...env, EVENT_DETECTION_CHOICE_THRESHOLD: choice })
      expect(configuration.choiceThreshold, choice).toBe(Number(choice))
      expect(configuration.itemCountThreshold, choice).toBe(DEFAULT_ITEM_COUNT_THRESHOLD)
    }
    // 件数監査を上書きしても、共通しきい値と項目別の既定値は元のまま。
    const overridden = await detectionConfiguration({
      ...env,
      EVENT_DETECTION_CHOICE_THRESHOLD: '0.7',
      EVENT_DETECTION_ITEM_COUNT_THRESHOLD: '0.8'
    })
    expect(overridden.itemCountThreshold).toBe(0.8)
    expect(overridden.choiceThreshold).toBe(0.7)
    expect(overridden.fieldThresholds).toEqual(resolveFieldThresholds(0.7))
  })
})

test('管理画面から保存した共通しきい値（KV）でも件数監査のしきい値は変わらない', async () => {
  await withKV(async (env) => {
    const stored = { eventThreshold: 0.95, ignoreThreshold: 0.3, choiceThreshold: 0.6 }
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_THRESHOLDS_KEY, JSON.stringify(stored))
    const saved = await detectionConfiguration(env)
    expect(saved).toMatchObject(stored)
    expect(saved.itemCountThreshold).toBe(DEFAULT_ITEM_COUNT_THRESHOLD)
    // 環境変数で件数監査だけを変えた場合も、保存値は共通しきい値にだけ効く。
    const both = await detectionConfiguration({ ...env, EVENT_DETECTION_ITEM_COUNT_THRESHOLD: '0.8' })
    expect(both).toMatchObject({ ...stored, itemCountThreshold: 0.8 })
    // 管理APIで保存しても、件数監査のしきい値は保存対象にならない。
    const response = await botRoutes.request(
      '/admin/bot/configuration',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'clef',
          thresholds: { eventThreshold: 0.92, ignoreThreshold: 0.4, choiceThreshold: 0.85 },
          fieldThresholds: resolveFieldThresholds(0.85)
        })
      },
      env
    )
    expect(response.status).toBe(200)
    const after = await detectionConfiguration(env)
    expect(after.choiceThreshold).toBe(0.85)
    expect(after.itemCountThreshold).toBe(DEFAULT_ITEM_COUNT_THRESHOLD)
    const keys = await env.BICCAME_MUSUME_EVENTS.list()
    expect(keys.keys.map((key) => key.name).sort()).toEqual(
      [EVENT_DETECTION_FIELD_THRESHOLDS_KEY, 'settings:event-detection:model', EVENT_DETECTION_THRESHOLDS_KEY].sort()
    )
    expect(await env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_THRESHOLDS_KEY, 'text')).not.toContain('itemCount')
  })
})
