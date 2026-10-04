import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useSearch
} from '@tanstack/react-router'
import { Provider } from 'jotai'
import { Suspense, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Route as NewEventRoute } from '@/app/routes/admin/events/new/index'
import { Route as EventsRoute } from '@/app/routes/events/index'
import { PaginatedEventGrid } from '@/components/events/paginated-event-grid'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useEvent, useEventOrNull } from '@/hooks/use-events'
import type { Event } from '@/schemas/event.dto'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const PageState = () => <output aria-label='所有ページ'>{String(useSearch({ strict: false }).page ?? 1)}</output>
const GridFixture = () => {
  const [page, setPage] = useState(2)
  const [events, setEvents] = useState<Event[]>(queryClient.getQueryData(['events']) ?? [])
  return (
    <>
      <button type='button' onClick={() => setEvents(events.slice(0, 12))}>
        13件から12件へ
      </button>
      <output aria-label='グリッド所有ページ'>{page}</output>
      <PaginatedEventGrid events={events} page={page} onPageChange={setPage} />
    </>
  )
}
const OptionalProbe = () => {
  const { data, isPending } = useEventOrNull('missing')
  if (isPending) return null
  return <output>{data === null ? 'optional null' : 'optional found'}</output>
}
const DetailProbe = () => {
  const { data } = useEvent('missing')
  return <output>{data === null ? 'detail null' : 'detail found'}</output>
}
const CacheProbe = () => {
  const [detail, setDetail] = useState(false)
  const [cache, setCache] = useState('unchecked')
  return (
    <>
      <button
        type='button'
        onClick={() =>
          setCache(queryClient.getQueryData(['events', 'missing']) === undefined ? 'isolated' : 'polluted')
        }
      >
        キャッシュ確認
      </button>
      <output>{cache}</output>
      <button type='button' onClick={() => setDetail(true)}>
        詳細へ
      </button>
      <Suspense fallback={null}>{detail ? <DetailProbe /> : <OptionalProbe />}</Suspense>
    </>
  )
}
const rootRoute = createRootRoute({
  component: () => (
    <>
      <button type='button' onClick={() => queryClient.invalidateQueries({ queryKey: ['events'], exact: true })}>
        一覧再取得
      </button>
      <PageState />
      <Outlet />
    </>
  )
})
const route = createRoute({
  path: '/events/',
  getParentRoute: () => rootRoute,
  component: EventsRoute.options.component,
  validateSearch: EventsRoute.options.validateSearch
})
const adminRoute = createRoute({
  path: '/admin/events/new/',
  getParentRoute: () => rootRoute,
  component: NewEventRoute.options.component,
  validateSearch: NewEventRoute.options.validateSearch,
  errorComponent: NewEventRoute.options.errorComponent
})
const cacheRoute = createRoute({
  path: '/cache',
  getParentRoute: () => rootRoute,
  component: CacheProbe,
  errorComponent: () => <p>detail unavailable</p>
})
const gridRoute = createRoute({ path: '/grid', getParentRoute: () => rootRoute, component: GridFixture })
const params = new URLSearchParams(location.search)
const initial = params.get('path') ?? '/events/'
const events = JSON.parse(params.get('events') ?? '[]') as Event[]
if (initial === '/grid') queryClient.setQueryData(['events'], events)
const router = createRouter({
  routeTree: rootRoute.addChildren([route, adminRoute, cacheRoute, gridRoute]),
  history: createMemoryHistory({ initialEntries: [initial] })
})
const container = document.getElementById('root')
if (!container) throw new Error('Missing test root')
createRoot(container).render(
  <Provider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </Provider>
)
