import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider
} from '@tanstack/react-router'
import { Provider } from 'jotai'
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Route as EventsRoute } from '@/app/routes/events/index'
import { BulkVoteButton } from '@/components/characters/bulk-vote-button'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useVoteRanking } from '@/hooks/use-vote-ranking'

const RankingCount = () => {
  const { data } = useVoteRanking()
  return <output aria-label='札幌の得票数'>{data.find((character) => character.id === 'sapporo')?.voteCount}</output>
}

const rootRoute = createRootRoute({
  component: () => (
    <>
      <section aria-label='個別投票'>
        <CharacterVoteButton characterId='sapporo' />
      </section>
      <section aria-label='一括投票'>
        <BulkVoteButton characterIds={['sapporo', 'akiba']} label='全員に投票' />
      </section>
      <Suspense fallback={null}>
        <RankingCount />
      </Suspense>
      <Outlet />
    </>
  )
})
const eventsRoute = createRoute({
  path: '/events/',
  getParentRoute: () => rootRoute,
  component: EventsRoute.options.component,
  validateSearch: EventsRoute.options.validateSearch
})
const router = createRouter({
  routeTree: rootRoute.addChildren([eventsRoute]),
  history: createMemoryHistory({ initialEntries: ['/events/'] })
})
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
