import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import type { FieldThresholds } from '@biccame/shared/event-detect/detection'
import type { AdminBotStatus } from '@biccame/shared/schemas/admin-bot.dto'
import { StoreDataSchema } from '@biccame/shared/schemas/store.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createStore, Provider } from 'jotai'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { INITIAL_WEBHOOK_FILTER, type WebhookFilter, webhookFilterAtom } from '@/atoms/webhook-filter-atom'
import { INITIAL_WEBHOOK_PAGINATION, webhookPaginationAtom } from '@/atoms/webhook-pagination-atom'
import { WebhookJobDetail } from '@/components/admin/webhook-job-detail'
import { WebhookJobList } from '@/components/admin/webhook-job-list'
import { ADMIN_BOT_QUERY_KEY } from '@/hooks/use-admin-bot'
import { ADMIN_WEBHOOK_QUERY_KEY, webhookJobListQueryKey } from '@/hooks/use-admin-webhooks'
import { charactersQueryKey } from '@/hooks/use-characters'
import canonicalCharacters from '../../workers/web/public/characters.json'

export const characters = (() => {
  const parsed = StoreDataSchema.array().safeParse(canonicalCharacters)
  if (!parsed.success) throw new Error('Invalid canonical character fixture')
  return parsed.data
})()

export const listJob: WebhookJob = {
  candidates: [],
  postId: '1000000000000000001',
  post: {
    id: '1000000000000000001',
    createdAt: '2026-10-02T03:00:00.000Z',
    screenName: 'synthetic_account',
    kind: 'original',
    text: '一覧に表示する投稿本文',
    url: 'https://example.invalid/post/1000000000000000001',
    media: []
  },
  sourceUrl: 'https://example.invalid/post/1000000000000000001',
  eventUUID: '550e8400-e29b-41d4-a716-446655440001',
  status: 'held',
  reasons: [],
  candidate: null,
  confidence: 0.72,
  model: 'clef-flash',
  questionVersion: 'test-v1',
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  eventTitle: '紐付け先の実イベント名',
  postStatus: 'ongoing',
  postStatusProbability: 0.99,
  answers: null,
  draft: null,
  attempts: 7,
  notificationStatus: 'unknown',
  notificationId: null,
  notificationError: null,
  notificationAttempts: 1,
  lastError: null,
  createdAt: '2026-10-05T03:00:00.000Z',
  updatedAt: '2026-10-05T03:00:00.000Z',
  judgedAt: null
}

export const uniformThresholds = (value: number): FieldThresholds => ({
  status: value,
  category: value,
  store: value,
  store_confirm: value,
  character: value,
  character_confirm: value,
  start_date: value,
  end_date: value,
  quantity: value,
  condition: value,
  purchase_amount: value,
  charge_amount: value
})

// 共通値と12項目すべてを同じしきい値にした設定。項目別の差は fieldThresholds で上書きして付ける。
export const botStatus = (choiceThreshold: number, fieldThresholds: Partial<FieldThresholds> = {}): AdminBotStatus => ({
  fetchedAt: '2026-10-05T03:00:00.000Z',
  botConnected: true,
  discord: null,
  webhook: {
    configured: true,
    queueConfigured: true,
    model: 'clef',
    eventThreshold: 0.9,
    ignoreThreshold: 0.5,
    choiceThreshold,
    fieldThresholds: { ...uniformThresholds(choiceThreshold), ...fieldThresholds }
  },
  error: null
})

export type RenderListOptions = { filter?: WebhookFilter; nextCursor?: string | null }

/** 一覧を描画する。jotai の既定ストアは使わず、テストごとの store に絞り込みの保存値を入れる（他のテストへ漏らさない）。 */
export const renderList = async (
  jobs: WebhookJob[],
  choiceThreshold?: number,
  fieldThresholds?: Partial<FieldThresholds>,
  { filter = INITIAL_WEBHOOK_FILTER, nextCursor = null }: RenderListOptions = {}
) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(webhookJobListQueryKey(null, filter), { jobs, nextCursor })
  queryClient.setQueryData(charactersQueryKey, characters)
  if (choiceThreshold !== undefined)
    queryClient.setQueryData(ADMIN_BOT_QUERY_KEY, botStatus(choiceThreshold, fieldThresholds))
  const store = createStore()
  store.set(webhookFilterAtom, filter)
  store.set(webhookPaginationAtom, INITIAL_WEBHOOK_PAGINATION)
  const routeTree = createRootRoute({ component: WebhookJobList })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  try {
    await router.load()
    return renderToStaticMarkup(
      createElement(
        Provider,
        { store },
        createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router }))
      )
    )
  } finally {
    queryClient.clear()
  }
}

export const renderDetail = async (
  job: WebhookJob,
  choiceThreshold?: number,
  fieldThresholds?: Partial<FieldThresholds>
) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData([...ADMIN_WEBHOOK_QUERY_KEY, job.postId], job)
  queryClient.setQueryData(charactersQueryKey, characters)
  if (choiceThreshold !== undefined)
    queryClient.setQueryData(ADMIN_BOT_QUERY_KEY, botStatus(choiceThreshold, fieldThresholds))
  const routeTree = createRootRoute({ component: () => createElement(WebhookJobDetail, { postId: job.postId }) })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  try {
    await router.load()
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router }))
    )
  } finally {
    queryClient.clear()
  }
}

export const statusCell = (markup: string) => [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)][6]?.[0]

export const eventNameCell = (markup: string) => [...markup.matchAll(/<td\b[^>]*>.*?<\/td>/g)][7]?.[0]

export const answerThresholds = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 }

export const shintouAnswers: Record<string, ClefAnswer> = {
  is_event: { type: 'noul', noul: 0.7224 },
  status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.7499, start: 0.15, none: 0.05 } },
  category: { type: 'choice', choice: 'acsta', probabilities: { acsta: 0.4544, ackey: 0.4279, other: 0.09 } },
  start_date: { type: 'choice', choice: 'd20261019', probabilities: { d20261019: 0.9943, none: 0.004 } },
  condition: { type: 'choice', choice: 'purchase', probabilities: { purchase: 0.9813, none: 0.01 } }
}

export const answerRows = (markup: string) =>
  [...markup.matchAll(/<tr\b[^>]*>.*?<\/tr>/g)].map((match) => match[0]).filter((row) => row.includes('<td'))

export const draft = { characterIds: [], title: '新東たん アクリルスタンド配布', stores: ['shintou'], conditions: [] }

export const anchorsOf = (markup: string) => [...markup.matchAll(/<a\b[^>]*>.*?<\/a>/g)].map((match) => match[0])

// ボタンは button か、asChild の Link（a）で出る。どちらも data-slot と data-variant を持つ。
export const outlineTags = (markup: string) =>
  [...markup.matchAll(/<(?:button|a)\b[^>]*data-variant="outline"[^>]*>/g)].map((match) => match[0])
