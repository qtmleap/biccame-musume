import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Provider } from 'jotai'
import { MotionConfig } from 'motion/react'
import { createRoot } from 'react-dom/client'
import { Route } from '@/app/routes/characters/index'
import { EventGridItem } from '@/components/events/event-grid-item'
import { EventListItem } from '@/components/home/event-list-item'
import { RankingList } from '@/components/ranking/ranking-list'
import { TooltipProvider } from '@/components/ui/tooltip'
import { events, ranking } from './fixtures'
import '@/index.css'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/zen-maru-gothic/400.css'
import '@fontsource/zen-maru-gothic/500.css'
import '@fontsource/zen-maru-gothic/700.css'
import '@fontsource/m-plus-1-code/400.css'
import '@fontsource/m-plus-1-code/500.css'
import '@fontsource/m-plus-1-code/700.css'

const Characters = Route.options.component!
const Fixture = () => (
  <main>
    <section data-surface='characters'>
      <Characters />
    </section>
    <section data-surface='home' className='mx-auto px-4 py-4 md:px-8 max-w-6xl'>
      <h2 className='text-foreground font-bold mb-4'>開催中・開催予定のイベント</h2>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
        {events.map((event, index) => (
          <div data-item={event.uuid} key={event.uuid}>
            <EventListItem event={event} index={index} />
          </div>
        ))}
      </div>
    </section>
    <section data-surface='events' className='mx-auto px-4 py-4 md:px-8 max-w-6xl'>
      <h2 className='text-foreground font-bold mb-4'>イベント一覧</h2>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
        {events.map((event, index) => (
          <div data-item={event.uuid} key={event.uuid}>
            <EventGridItem event={event} index={index} />
          </div>
        ))}
      </div>
    </section>
    <section data-surface='ranking' className='mx-auto px-4 py-4 md:px-8 max-w-6xl'>
      <h2 className='text-foreground font-bold mb-4'>ランキング</h2>
      <RankingList characters={ranking} />
    </section>
  </main>
)
const root = createRootRoute({ component: Fixture })
const router = createRouter({
  routeTree: root.addChildren([
    createRoute({ path: '/characters/$id', getParentRoute: () => root, component: () => null }),
    createRoute({ path: '/events/$uuid', getParentRoute: () => root, component: () => null })
  ]),
  history: createMemoryHistory({ initialEntries: ['/'] })
})
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark')
const container = document.getElementById('root')
if (!container) throw new Error('Missing fixture root')
createRoot(container).render(
  <Provider>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MotionConfig reducedMotion='always'>
          <RouterProvider router={router} />
        </MotionConfig>
      </TooltipProvider>
    </QueryClientProvider>
  </Provider>
)
