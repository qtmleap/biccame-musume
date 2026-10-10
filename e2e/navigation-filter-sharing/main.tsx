import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider } from '@tanstack/react-router'
import type { User } from 'firebase/auth'
import { createStore, Provider } from 'jotai'
import { createRoot } from 'react-dom/client'
import { Route as CharactersRoute } from '@/app/routes/characters/index'
import { Route as EventsRoute } from '@/app/routes/events/index'
import { Route as HomeRoute } from '@/app/routes/index'
import { Route as LocationRoute } from '@/app/routes/location/index'
import { backendSessionStateAtom, userAtom } from '@/atoms/auth-atom'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

// Synthetic signed-in presentation fixture only; no Firebase login or real account.
// ?anon を付けると未ログインで始まり、「ログイン(テスト)」ボタンで後から確定する(ログインの確定が非同期な状況の再現)。
const store = createStore()
const signIn = () => {
  store.set(userAtom, { uid: 'synthetic-a14', displayName: 'テスト利用者' } as User)
  store.set(backendSessionStateAtom, { status: 'ready', uid: 'synthetic-a14' })
}
if (!new URLSearchParams(location.search).has('anon')) signIn()
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const root = createRootRoute({
  component: () => (
    <>
      <nav aria-label='テスト移動'>
        <Link to='/characters'>娘一覧へ</Link>
        <Link to='/events'>イベント一覧へ</Link>
        <button type='button' onClick={() => queryClient.invalidateQueries({ queryKey: ['events'], exact: true })}>
          一覧再取得
        </button>
        <button type='button' onClick={signIn}>
          ログイン(テスト)
        </button>
      </nav>
      <Outlet />
    </>
  )
})
const home = createRoute({ path: '/', getParentRoute: () => root, component: HomeRoute.options.component })
const events = createRoute({
  path: '/events/',
  getParentRoute: () => root,
  component: EventsRoute.options.component,
  validateSearch: EventsRoute.options.validateSearch
})
const characters = createRoute({
  path: '/characters/',
  getParentRoute: () => root,
  component: CharactersRoute.options.component
})
const locationRoute = createRoute({
  path: '/location/',
  getParentRoute: () => root,
  component: LocationRoute.options.component,
  validateSearch: LocationRoute.options.validateSearch
})
const router = createRouter({ routeTree: root.addChildren([home, events, characters, locationRoute]) })
const container = document.getElementById('root')
if (!container) throw new Error('Missing test root')
createRoot(container).render(
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </Provider>
)
