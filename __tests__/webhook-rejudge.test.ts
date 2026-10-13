import { describe, expect, test } from 'bun:test'
import {
  type WebhookJob,
  WebhookJobStatusSchema,
  WebhookNotificationStatusSchema
} from '@biccame/shared/schemas/webhook.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookJobDetail } from '@/components/admin/webhook-job-detail'
import { webhookActionAvailability } from '@/components/admin/webhook-labels'
import { ADMIN_WEBHOOK_QUERY_KEY, useRejudgeAdminWebhookJob } from '@/hooks/use-admin-webhooks'
import { adminEndpoints } from '@/utils/client/admin'

const postId = '1000000000000000001'
const baseJob: WebhookJob = {
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
const renderDetail = async (job: WebhookJob | null) => {
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

type ButtonState = 'missing' | 'disabled' | 'enabled'

/** ラベルを含むボタンの状態。描画されていなければ missing、disabled 属性があれば disabled。 */
const buttonState = (markup: string, label: string): ButtonState => {
  const button = [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)]
    .map((match) => match[0])
    .find((markupOfButton) => markupOfButton.includes(label))
  if (button === undefined) return 'missing'
  return /^<button\b[^>]*\sdisabled=""/.test(button) ? 'disabled' : 'enabled'
}

describe('保留ジョブの再判定', () => {
  test('再判定できるのは保留のジョブだけで、通知状態には左右されない', () => {
    for (const status of WebhookJobStatusSchema.options) {
      for (const notificationStatus of ['pending', 'sent', 'failed', 'unknown', 'skipped']) {
        expect(webhookActionAvailability(status, notificationStatus).canRejudge).toBe(status === 'held')
      }
    }
    expect(webhookActionAvailability('held', 'sent')).toEqual({
      canResolve: true,
      canRetryProcessing: false,
      canRejudge: true,
      canRetryNotification: false
    })
  })

  test('再判定のクライアントはボディなしのPOSTで、パスは管理APIの経路に一致する', () => {
    const endpoint = adminEndpoints.find((entry) => entry.alias === 'rejudgeAdminWebhookJob')
    expect(endpoint?.method).toBe('post')
    expect(endpoint?.path).toBe('/api/admin/webhook/jobs/:postId/rejudge')
    expect(endpoint?.parameters?.map((parameter) => [parameter.name, parameter.type])).toEqual([['postId', 'Path']])
  })

  test('再判定のフックは実行関数を返し、実行前は待機中にならない', () => {
    const Probe = () => {
      const mutation = useRejudgeAdminWebhookJob()
      return createElement('p', null, `${typeof mutation.mutateAsync}:${mutation.isPending}`)
    }
    const queryClient = new QueryClient()
    try {
      expect(
        renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)))
      ).toBe('<p>function:false</p>')
    } finally {
      queryClient.clear()
    }
  })

  // ボタンの探し方が正しいことを、すでにある操作ボタンで確かめる。
  test('既存の操作ボタンは状態によらず描画され、使えるときだけ有効になる', async () => {
    const held = await renderDetail({ ...baseJob, status: 'held', notificationStatus: 'sent' })
    expect(buttonState(held, '判定を再試行')).toBe('disabled')
    expect(buttonState(held, '補完して登録')).toBe('enabled')
    const failed = await renderDetail({ ...baseJob, status: 'failed' })
    expect(buttonState(failed, '判定を再試行')).toBe('enabled')
    expect(buttonState(failed, '補完して登録')).toBe('disabled')
    expect(buttonState(await renderDetail(null), '判定を再試行')).toBe('disabled')
  })

  test('「再判定」ボタンは状態によらず常に描画され、保留のときだけ有効になる', async () => {
    for (const status of WebhookJobStatusSchema.options) {
      expect(buttonState(await renderDetail({ ...baseJob, status }), '再判定')).toBe(
        status === 'held' ? 'enabled' : 'disabled'
      )
    }
  })

  test('「再判定」ボタンは通知状態によらず、保留なら有効になる', async () => {
    for (const notificationStatus of WebhookNotificationStatusSchema.options) {
      expect(buttonState(await renderDetail({ ...baseJob, status: 'held', notificationStatus }), '再判定')).toBe(
        'enabled'
      )
    }
  })

  test('読み込み前でも「再判定」ボタンは隠れず、無効のまま描画される', async () => {
    expect(buttonState(await renderDetail(null), '再判定')).toBe('disabled')
  })

  test('「再判定」ボタンは「判定を再試行」と「通知を再送」の間に置かれる', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'held' })
    const retry = markup.indexOf('判定を再試行')
    const rejudge = markup.indexOf('再判定')
    const notification = markup.indexOf('通知を再送')
    expect(retry).toBeGreaterThan(-1)
    expect(rejudge).toBeGreaterThan(retry)
    expect(notification).toBeGreaterThan(rejudge)
  })
})
