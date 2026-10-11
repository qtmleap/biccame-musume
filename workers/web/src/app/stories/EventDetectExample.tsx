import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider
} from '@tanstack/react-router'
import { useMemo } from 'react'
import { EventDetectNav } from '@/components/admin/event-detect/nav'
import * as ChartsPage from '@/routes/admin/event-detect/charts/index'
import * as EmulatedDetailPage from '@/routes/admin/event-detect/emulated/$id/index'
import * as EmulatedPage from '@/routes/admin/event-detect/emulated/index'
import * as EventDetailPage from '@/routes/admin/event-detect/events/$uuid/index'
import * as EventsPage from '@/routes/admin/event-detect/events/index'
import * as GapsPage from '@/routes/admin/event-detect/gaps/index'
import * as StatsPage from '@/routes/admin/event-detect/index'
import * as KeywordsPage from '@/routes/admin/event-detect/keywords/index'
import * as PostsPage from '@/routes/admin/event-detect/posts/index'

// 本番のDEV専用レイアウトは変更せず、各ローカル画面の実コンポーネントと検索検証を独立ルーターで描画する。
export const EventDetectExample = ({ path }: { path: string }) => {
  const router = useMemo(() => {
    const root = createRootRoute({
      component: () => (
        <>
          <EventDetectNav />
          <div className='mt-6'>
            <Outlet />
          </div>
        </>
      )
    })
    const routes = [
      createRoute({
        getParentRoute: () => root,
        path: '/admin/event-detect/',
        component: StatsPage.Route.options.component,
        validateSearch: StatsPage.Route.options.validateSearch
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/admin/event-detect/charts/',
        component: ChartsPage.Route.options.component
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/admin/event-detect/emulated/',
        component: EmulatedPage.Route.options.component,
        validateSearch: EmulatedPage.Route.options.validateSearch
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/admin/event-detect/emulated/$id/',
        component: EmulatedDetailPage.Route.options.component
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/admin/event-detect/events/',
        component: EventsPage.Route.options.component,
        validateSearch: EventsPage.Route.options.validateSearch
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/admin/event-detect/events/$uuid/',
        component: EventDetailPage.Route.options.component
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/admin/event-detect/gaps/',
        component: GapsPage.Route.options.component,
        validateSearch: GapsPage.Route.options.validateSearch
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/admin/event-detect/keywords/',
        component: KeywordsPage.Route.options.component
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/admin/event-detect/posts/',
        component: PostsPage.Route.options.component,
        validateSearch: PostsPage.Route.options.validateSearch
      })
    ]
    return createRouter({
      routeTree: root.addChildren(routes),
      history: createMemoryHistory({ initialEntries: [path] })
    })
  }, [path])
  return (
    <div data-testid='production-page' data-fixture-path={path} className='mx-auto max-w-6xl'>
      <p className='mb-4 text-sm text-muted-foreground'>ローカル専用ビューワ · 合成データ（外部サービス未使用）</p>
      <RouterProvider router={router} />
    </div>
  )
}
