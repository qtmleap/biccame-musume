import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import type { Event } from '@biccame/shared/schemas/event.dto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EventPostList } from '@/components/admin/event-post-list'
import { ADMIN_WEBHOOK_EVENTS_QUERY_KEY } from '@/hooks/use-events'
import { eventsEndpoints } from '@/utils/client/events'

const event: Event = {
  uuid: '550e8400-e29b-41d4-a716-446655440001',
  title: 'Webhook作成のアクキー配布',
  category: 'ackey',
  stores: ['akiba'],
  conditions: [],
  startDate: dayjs('2026-10-01').toDate(),
  createdAt: dayjs('2026-10-01').toDate(),
  updatedAt: dayjs('2026-10-01').toDate(),
  status: 'ongoing',
  daysUntil: 0,
  isVerified: true,
  isPreliminary: false,
  interestedCount: 0,
  completedCount: 0
}

const renderList = async (state: 'pending' | 'error' | Event[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (Array.isArray(state)) client.setQueryData(ADMIN_WEBHOOK_EVENTS_QUERY_KEY, state)
  if (state === 'error') {
    const query = client.getQueryCache().build(client, { queryKey: ADMIN_WEBHOOK_EVENTS_QUERY_KEY })
    query.setState({ status: 'error', error: new Error('Synthetic failure'), fetchStatus: 'idle' })
  }
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({ routeTree: createRootRoute({ component: EventPostList }), history })
  try {
    await router.load()
    const markup = renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router }))
    )
    expect(history.location.search).toBe('')
    return markup
  } finally {
    client.clear()
  }
}

test('自動作成イベントはカテゴリを限定せず表示し、詳細へリンクする', async () => {
  const markup = await renderList([event])
  expect(markup).toContain('自動作成イベント')
  expect(markup).toContain('保留を承認して作成したイベントも含みます')
  expect(markup).toContain(event.title)
  expect(markup).toContain(`/events/${event.uuid}`)
  expect(markup).toContain('2026/10/01')
  expect(markup).toContain('whitespace-nowrap')
})

test('既存のページングで1ページ12件に制限する', async () => {
  const events = Array.from({ length: 13 }, (_, index) => ({
    ...event,
    uuid: crypto.randomUUID(),
    title: `投稿イベント ${index}`
  }))
  const markup = await renderList(events)
  expect([...markup.matchAll(/<tr\b/g)]).toHaveLength(13)
  expect(markup).not.toContain('投稿イベント 12')
  expect(markup).toContain('aria-label="pagination"')
})

test('空・読み込み・失敗を表示する', async () => {
  expect(await renderList([])).toContain('Webhookから作成されたイベントはありません')
  expect(await renderList('pending')).toContain('イベントを取得しています')
  expect(await renderList('error')).toContain('更新から再試行できます')
})

test('管理導線と認証・クライアント契約を保つ', async () => {
  const home = await readFile('workers/web/src/app/routes/admin/index.tsx', 'utf8')
  expect(home).toContain("title: '設定'")
  expect(home).toContain("title: '自動作成イベント'")
  expect(home).toContain("description: '自動作成されたイベント一覧'")
  expect(home).toContain("to: '/admin/event-posts'")
  expect(home).not.toContain('DEV_MENU_ITEMS')
  expect(home).not.toContain('設定を確認')
  const admin = await readFile('workers/web/src/api/routes/admin/index.ts', 'utf8')
  expect(admin).toContain("admin.use('/admin/*', CFAuth)")
  expect(admin).toContain("admin.route('/', adminEvents)")
  expect(eventsEndpoints.find((endpoint) => endpoint.alias === 'getAdminWebhookEvents')?.path).toBe(
    '/api/admin/webhook-events'
  )
  const viewer = await readFile('workers/web/src/app/routes/admin/event-detect.tsx', 'utf8')
  expect(viewer).toContain("createFileRoute('/admin/event-detect')")
})
