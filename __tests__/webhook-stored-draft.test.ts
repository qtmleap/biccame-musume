import { expect, test } from 'bun:test'
import { storedWebhookDraft } from '@api/services/webhook-stored-draft'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { makeJob } from './fixtures/webhook-d1-jobs'

test('旧保存の明示店舗を復元するが対象ビッカメ娘は店舗から推定しない', () => {
  const draft = storedWebhookDraft(makeJob().post, {
    store: { type: 'choice', choice: 'hamamatsu', probabilities: { hamamatsu: 0.9311, none: 0.0689 } }
  })
  expect(draft.stores).toEqual(['hamamatsu'])
  expect(draft.characterIds).toEqual([])
})

test('旧保存の正しい最有力値は低確率でも未確定の下書きとして失わない', () => {
  expect(
    storedWebhookDraft(makeJob().post, {
      store: { type: 'choice', choice: 'hamamatsu', probabilities: { hamamatsu: 0.49, akiba: 0.3, none: 0.21 } }
    }).stores
  ).toEqual(['hamamatsu'])
})

test('新しい店舗の否定判定を旧保存回答で上書きしない', () => {
  const draft = storedWebhookDraft(makeJob().post, {
    store: { type: 'choice', choice: 'hamamatsu', probabilities: { hamamatsu: 0.99, none: 0.01 } },
    'venue.hamamatsu': { type: 'noul', noul: 0.02 }
  })
  expect(draft.stores).toEqual([])
})

test('旧回答の未確定・未知店舗・不整合な最有力値を補完しない', () => {
  const answers: ClefAnswer[] = [
    { type: 'choice', choice: 'none', probabilities: { none: 0.99, hamamatsu: 0.01 } },
    { type: 'choice', choice: 'unknown_store', probabilities: { unknown_store: 0.99 } },
    { type: 'choice', choice: 'hamamatsu', probabilities: { hamamatsu: 0.49, none: 0.51 } }
  ]
  for (const answer of answers) {
    expect(storedWebhookDraft(makeJob().post, { store: answer }).stores).toEqual([])
  }
})
