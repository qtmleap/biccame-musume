import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookJobDetail } from '@/components/admin/webhook-job-detail'
import { ADMIN_WEBHOOK_QUERY_KEY } from '@/hooks/use-admin-webhooks'

export const postId = '1000000000000000001'

export const baseJob: WebhookJob = {
  candidates: [],
  postId,
  post: {
    id: postId,
    createdAt: '2026-10-02T03:00:00.000Z',
    screenName: 'synthetic_account',
    kind: 'original',
    text: '再判定の確認に使う投稿本文',
    url: `https://example.invalid/post/${postId}`,
    media: []
  },
  sourceUrl: `https://example.invalid/post/${postId}`,
  eventUUID: '550e8400-e29b-41d4-a716-446655440001',
  status: 'held',
  reasons: [],
  candidate: null,
  confidence: 0.72,
  model: 'clef-flash',
  questionVersion: 'test-v1',
  eventId: null,
  eventTitle: null,
  postStatus: 'announce',
  postStatusProbability: 0.75,
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

/** 詳細画面を描画する。job が null のときは読み込み前（取得データなし）の画面になる。 */
export const renderDetail = async (job: WebhookJob | null) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (job !== null) queryClient.setQueryData([...ADMIN_WEBHOOK_QUERY_KEY, job.postId], job)
  const routeTree = createRootRoute({ component: () => createElement(WebhookJobDetail, { postId }) })
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

export type ButtonState = 'missing' | 'disabled' | 'enabled'

/** 受信詳細の操作ボタンのラベル。画面側の文言とは別に、ここで固定する。 */
export const REJUDGE_LABEL = '再実行'

/** 一つに統合する前にあったボタンの文言。受信詳細のボタンにも説明（title）にも出てはならない。 */
export const REMOVED_LABELS = [
  '失敗した処理を再実行',
  '判定を再確認',
  'AI で判定し直す',
  '判定を再試行',
  '再判定'
] as const

/** 保留・対象外（canLink）のときに有効になるボタン。 */
export const LINK_LABEL = '連携'

/** イベント作成ページへ遷移するリンク。ボタンではなく <a> で、受信ジョブの状態に関係なく常に押せる。 */
export const CREATE_LABEL = '補完して登録'

/** ラベルを含むボタンの状態。描画されていなければ missing、disabled 属性があれば disabled。 */
export const buttonState = (markup: string, label: string): ButtonState => {
  const button = [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)]
    .map((match) => match[0])
    .find((markupOfButton) => markupOfButton.includes(label))
  if (button === undefined) return 'missing'
  return /^<button\b[^>]*\sdisabled=""/.test(button) ? 'disabled' : 'enabled'
}

export type LinkInfo = { href: string | undefined; disabled: boolean }

/** ラベルを含む <a> の情報。描画されていなければ undefined。disabled は無効を示す属性（disabled / aria-disabled）の有無。 */
export const linkOf = (markup: string, label: string): LinkInfo | undefined => {
  const link = [...markup.matchAll(/<a\b[^>]*>.*?<\/a>/g)]
    .map((match) => match[0])
    .find((markupOfLink) => markupOfLink.includes(label))
  if (link === undefined) return undefined
  const openTag = link.slice(0, link.indexOf('>') + 1)
  const href = /\shref="([^"]*)"/.exec(openTag)
  return {
    href: href === null ? undefined : href[1],
    disabled: /\s(disabled|aria-disabled)(=|\s|>)/.test(openTag)
  }
}

export const answers: Record<string, ClefAnswer> = {
  is_event: { type: 'noul', noul: 0.7224 },
  status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.7499, start: 0.15, none: 0.05 } }
}

export const JUDGING_NOTICE = '判定中です。結果が出ると自動で更新されます。'
