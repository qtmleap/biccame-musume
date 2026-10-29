import { expect, test } from 'bun:test'
import { recordWebhookDiscovery } from '@api/services/webhook-discovery-record'
import { storedWebhookItemCountReviewReasons } from '@api/services/webhook-item-count-review'
import { DetectionCandidateSchema } from '@biccame/shared/event-detect/detection'
import { auditItemCount } from '@biccame/shared/event-detect/extraction'
import { event, makeJob } from './fixtures/webhook-d1-jobs'

const audit = (choice: string, probability: number) =>
  auditItemCount(
    [{ item: '限定名刺' }],
    { answers: { distribution_item_count: { type: 'choice', choice, probabilities: { [choice]: probability } } } },
    0.9
  )

test('保存された件数の監査から確認理由を計算する（自動登録の関門としては使わない純粋な計算）', () => {
  expect(storedWebhookItemCountReviewReasons(JSON.stringify({ itemCountAudit: audit('1', 0.99) }))).toEqual([])
  expect(storedWebhookItemCountReviewReasons(JSON.stringify({ itemCountAudit: audit('1', 0.82) }))).toEqual([
    'distribution_item_count_low_confidence'
  ])
  expect(storedWebhookItemCountReviewReasons(JSON.stringify({ itemCountAudit: audit('2', 0.99) }))).toEqual([
    'distribution_item_count_mismatch'
  ])
})

test('発見済みの完全候補は、件数の監査に関係なく create のまま（件数の理由も不足項目も付けない）', () => {
  const candidate = DetectionCandidateSchema.safeParse({ ...event, startDate: '2026-10-11' })
  if (!candidate.success) throw new Error('Invalid candidate fixture')
  const saved = recordWebhookDiscovery(
    makeJob().post,
    { is_event: { type: 'noul', noul: 0.99 } },
    { status: 'register', confidence: 0.99, reasons: [], candidate: candidate.data }
  )
  expect(saved.relevance).toBe('detected')
  expect(saved.action).toBe('create')
  expect(saved.missingFields).not.toContain('itemCountAudit')
  expect(saved.reasons.some((reason) => reason.startsWith('distribution_item_count_'))).toBe(false)
})

test('監査未保存は確認理由 unknown になるが、検証済みの旧register再試行だけは空になる（計算だけ。登録は止めない）', () => {
  const candidate = DetectionCandidateSchema.safeParse({ ...event, startDate: '2026-10-11' })
  if (!candidate.success) throw new Error('Invalid candidate fixture')
  const result = { status: 'register', confidence: 0.99, reasons: [], candidate: candidate.data }
  const context = { post: makeJob().post, resultJson: JSON.stringify(result) }
  expect(storedWebhookItemCountReviewReasons(null)).toEqual(['distribution_item_count_unknown'])
  expect(storedWebhookItemCountReviewReasons('{"version":"legacy-single"}')).toEqual([
    'distribution_item_count_unknown'
  ])
  expect(storedWebhookItemCountReviewReasons(null, context)).toEqual([])
  expect(storedWebhookItemCountReviewReasons('{"version":"legacy-single"}', context)).toEqual([])
  expect(storedWebhookItemCountReviewReasons('{"version":"giveaways-v2"}', context)).toEqual([])
  expect(storedWebhookItemCountReviewReasons('{"version":"giveaways-v6-focused-review"}', context)).toEqual([
    'distribution_item_count_unknown'
  ])
  for (const raw of ['{broken', 'null', '{"itemCountAudit":null}', '{"itemCountAudit":{}}']) {
    expect(storedWebhookItemCountReviewReasons(raw, context)).toEqual(['distribution_item_count_unknown'])
  }
  for (const extra of [{ discovery: null }, { outcome: {} }]) {
    expect(
      storedWebhookItemCountReviewReasons('{"version":"legacy-single"}', {
        ...context,
        resultJson: JSON.stringify({ ...result, ...extra })
      })
    ).toEqual(['distribution_item_count_unknown'])
  }
  expect(
    storedWebhookItemCountReviewReasons('{"version":"legacy-single"}', {
      ...context,
      post: {
        ...context.post,
        extractionContext: {
          kind: 'item',
          item: '名刺',
          evidence: [context.post.text],
          originalText: context.post.text
        }
      }
    })
  ).toEqual(['distribution_item_count_unknown'])
  expect(storedWebhookItemCountReviewReasons('{"version":"legacy-single"}', { ...context, resultJson: null })).toEqual([
    'distribution_item_count_unknown'
  ])
})
