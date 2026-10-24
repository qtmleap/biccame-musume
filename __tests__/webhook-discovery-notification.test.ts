import { expect, test } from 'bun:test'
import { buildDetectionNotification } from '@api/services/discord'
import { type EventDetectionNotification, eventDetectionNotificationSchema } from '@biccame/shared/bot'

const input: EventDetectionNotification = {
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  postId: '2110000000000000000',
  status: 'held',
  postUrl: 'https://x.com/bic_akiba/status/2110000000000000000',
  managementUrl: 'https://example.invalid/admin/webhooks/2110000000000000000',
  text: '名刺配布の開始は11月1日です。条件は後日案内します。',
  confidence: 0.96,
  reasons: ['distribution_condition_unspecified'],
  stores: ['ビックカメラAKIBA'],
  characters: [],
  discovery: {
    relevance: 'detected',
    action: 'review',
    confidence: 0.96,
    evidence: ['model_event_confirmed'],
    missingFields: ['conditions', 'characterIds'],
    reasons: ['distribution_condition_unspecified']
  }
}

test('Discordでも検出済みと登録情報不足を独立表示する', () => {
  expect(eventDetectionNotificationSchema.safeParse(input).success).toBe(true)
  const payload = buildDetectionNotification(input)
  expect(payload.embeds[0]?.fields).toContainEqual({ name: '検出結果', value: '検出済み', inline: true })
  expect(payload.embeds[0]?.fields).toContainEqual({ name: '登録判断', value: '情報を確認', inline: true })
  expect(payload.embeds[0]?.fields).toContainEqual({
    name: '不足・未確定の情報',
    value: '入手条件・対象ビッカメ娘',
    inline: false
  })
  expect(JSON.stringify(payload)).not.toContain('誰でも')
})

test('旧通知は検出判定を捏造せず従来の保留説明を維持する', () => {
  const { discovery: _discovery, ...legacy } = input
  const payload = buildDetectionNotification(legacy)
  expect(payload.content).toContain('保留')
  expect(payload.embeds[0]?.fields.some((field) => field.name === '検出結果')).toBe(false)
})
