import { expect, test } from 'bun:test'
import { WebhookJobQuerySchema } from '@biccame/shared/schemas/webhook.dto'
import { createStore } from 'jotai'
import {
  changeWebhookFilterAtom,
  NO_WEBHOOK_FILTER,
  parseWebhookFilter,
  setWebhookDiscovery,
  webhookFilterAtom
} from '@/atoms/webhook-filter-atom'
import { INITIAL_WEBHOOK_PAGINATION, webhookPaginationAtom } from '@/atoms/webhook-pagination-atom'

test('検出結果は登録statusと独立したクエリで、旧保存フィルターを破棄しない', () => {
  for (const discovery of ['detected', 'uncertain', 'not_detected', 'unrecorded']) {
    expect(WebhookJobQuerySchema.safeParse({ discovery, status: 'held' }).success).toBe(true)
  }
  expect(WebhookJobQuerySchema.safeParse({ discovery: 'held' }).success).toBe(false)
  const { discovery: _discovery, ...legacy } = {
    ...NO_WEBHOOK_FILTER,
    screenName: 'bic_akiba',
    verdict: 'excluded' as const
  }
  expect(parseWebhookFilter(legacy)).toEqual({ ...legacy, discovery: null })
})

test('検出結果の変更は他条件を保ちページだけを戻す', () => {
  const store = createStore()
  store.set(webhookFilterAtom, { ...NO_WEBHOOK_FILTER, screenName: 'bic_akiba', postStatus: 'ongoing' })
  store.set(webhookPaginationAtom, { cursor: '2110000000000000000', previousCursors: [null] })
  store.set(changeWebhookFilterAtom, (filter) => setWebhookDiscovery(filter, 'detected'))
  expect(store.get(webhookFilterAtom)).toEqual({
    ...NO_WEBHOOK_FILTER,
    screenName: 'bic_akiba',
    postStatus: 'ongoing',
    discovery: 'detected'
  })
  expect(store.get(webhookPaginationAtom)).toEqual(INITIAL_WEBHOOK_PAGINATION)
})
