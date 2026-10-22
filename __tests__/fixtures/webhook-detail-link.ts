import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import type { WebhookCandidate, WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  defaultParseSearch,
  RouterProvider
} from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookJobDetail } from '@/components/admin/webhook-job-detail'
import { ADMIN_WEBHOOK_QUERY_KEY } from '@/hooks/use-admin-webhooks'

export const postId = '1000000000000000001'

export const sourceUrl = `https://example.invalid/post/${postId}`

export const firstUuid = '550e8400-e29b-41d4-a716-446655440001'

export const secondUuid = '550e8400-e29b-41d4-a716-446655440002'

export const baseJob: WebhookJob = {
  candidates: [],
  postId,
  post: {
    id: postId,
    createdAt: '2026-10-02T03:00:00.000Z',
    screenName: 'synthetic_account',
    kind: 'original',
    text: '赤い限定名刺と青い限定名刺を配布します',
    url: sourceUrl,
    media: []
  },
  sourceUrl,
  eventUUID: firstUuid,
  status: 'held',
  reasons: [],
  candidate: null,
  confidence: 0.72,
  model: 'clef-flash',
  questionVersion: 'test-v1',
  eventId: null,
  eventTitle: null,
  postStatus: 'start',
  postStatusProbability: 0.99,
  answers: null,
  draft: null,
  attempts: 1,
  notificationStatus: 'sent',
  notificationId: null,
  notificationError: null,
  notificationAttempts: 1,
  lastError: null,
  createdAt: '2026-10-05T03:00:00.000Z',
  updatedAt: '2026-10-05T03:00:00.000Z',
  judgedAt: null
}

export const eventOf = (title: string, uuid: string): EventRequest => ({
  uuid,
  category: 'limited_card',
  title,
  stores: ['akiba'],
  characterIds: ['akiba'],
  startDate: '2026-10-11T00:00:00+09:00',
  isVerified: true,
  isPreliminary: false,
  shouldTweet: false,
  conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
  referenceUrls: [{ uuid: '22222222-2222-4222-a222-222222222222', type: 'announce', url: sourceUrl }]
})

export const candidateOf = (
  item: string,
  uuid: string,
  overrides: Partial<WebhookCandidate> = {}
): WebhookCandidate => ({
  ...baseJob,
  eventUUID: uuid,
  item,
  storeKey: null,
  ...overrides
})

export const renderDetail = async (job: WebhookJob) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData([...ADMIN_WEBHOOK_QUERY_KEY, job.postId], job)
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

/** 「識別されたイベント」の節のマークアップ */
export const identifiedSection = (markup: string) =>
  markup.match(/aria-label="識別されたイベント"[\s\S]*?<\/section>/)?.[0]

/**
 * 「補完して登録」リンクの遷移先。href は文字列一致で比べず、パスと search に分けて返す
 * （TanStack Router の既定の search は JSON として読めてしまう文字列を引用符つきで出すので、読み戻して比べる）。
 */
export const createLink = (markup: string) => {
  const href = markup.match(/<a\b[^>]*?href="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*?補完して登録/)?.[1]
  if (href === undefined) return undefined
  const url = new URL(href.replaceAll('&amp;', '&'), 'http://localhost')
  return { path: url.pathname, search: defaultParseSearch(url.search) }
}
