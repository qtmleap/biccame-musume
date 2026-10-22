import { expect, test } from 'bun:test'
import { canAutoRegisterWebhookCandidate } from '@api/services/webhook-auto-registration'
import type { DetectionResult } from '@biccame/shared/event-detect/detection'
import type { WebhookDiscovery } from '@biccame/shared/schemas/webhook.dto'
import { event, makeJob } from './fixtures/webhook-d1-jobs'

const result: DetectionResult = {
  status: 'register',
  confidence: 0.99,
  reasons: [],
  candidate: {
    category: 'limited_card',
    title: '限定名刺',
    stores: ['akiba'],
    characterIds: ['akiba'],
    startDate: '2026-10-11',
    conditions: [{ type: 'everyone' }],
    referenceUrls: [{ type: 'announce', url: event.referenceUrls[0].url }],
    isPreliminary: false
  }
}
const discovery: WebhookDiscovery = {
  relevance: 'detected',
  action: 'create',
  confidence: 0.99,
  evidence: ['model_event_confirmed'],
  missingFields: [],
  reasons: []
}

test('発見済み・新規作成・完全な登録候補が揃う場合だけ新形式を自動登録する', () => {
  expect(canAutoRegisterWebhookCandidate(makeJob().post, result, event, discovery)).toBe(true)
  expect(canAutoRegisterWebhookCandidate(makeJob().post, result, null, discovery)).toBe(false)
  expect(
    canAutoRegisterWebhookCandidate(makeJob().post, { status: 'held', confidence: 0.99, reasons: [] }, event, discovery)
  ).toBe(false)
  expect(
    canAutoRegisterWebhookCandidate(makeJob().post, result, event, { ...discovery, missingFields: ['conditions'] })
  ).toBe(false)
  expect(canAutoRegisterWebhookCandidate(makeJob().post, result, event, { ...discovery, relevance: 'uncertain' })).toBe(
    false
  )
})

test('関連性が確定しても更新・終了・要確認のactionを新規登録へ昇格しない', () => {
  for (const action of ['update', 'end', 'review', 'none'] as const) {
    expect(canAutoRegisterWebhookCandidate(makeJob().post, result, event, { ...discovery, action })).toBe(false)
  }
})

test('配布物ゼロの企画文脈は、モデルが完全な候補を返しても自動登録しない', () => {
  const post = {
    ...makeJob().post,
    extractionContext: {
      kind: 'event' as const,
      item: '企画情報',
      evidence: ['展示は本日で終了'],
      originalText: '展示は本日で終了'
    }
  }
  expect(canAutoRegisterWebhookCandidate(post, result, event, discovery)).toBe(false)
  expect(canAutoRegisterWebhookCandidate(post, result, event, null)).toBe(false)
})

test('旧形式は明示registerと検証済み候補の既存再試行契約だけを維持する', () => {
  const before = JSON.stringify(result)
  expect(canAutoRegisterWebhookCandidate(makeJob().post, result, event, null)).toBe(true)
  expect(
    canAutoRegisterWebhookCandidate(makeJob().post, { status: 'ignored', confidence: 0.99, reasons: [] }, event, null)
  ).toBe(false)
  expect(JSON.stringify(result)).toBe(before)
})
