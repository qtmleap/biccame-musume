import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Provider } from 'jotai'
import { MotionConfig } from 'motion/react'
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { CharacterDetailContent } from '@/components/characters/character-detail-content'
import { TooltipProvider } from '@/components/ui/tooltip'
import { character, characters, events } from './fixtures'
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

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
queryClient.setQueryData(['characters'], characters)
queryClient.setQueryData(['events'], events)
queryClient.setQueryData(['me', 'favorites'], { favorites: [] })
const root = createRootRoute({
  component: () => (
    <Suspense fallback={<p>読み込み中</p>}>
      <CharacterDetailContent character={character} />
    </Suspense>
  )
})
const destinations = ['/events', '/events/$uuid', '/characters', '/location', '/characters/$id'].map((path) =>
  createRoute({ path, getParentRoute: () => root, component: () => null })
)
const router = createRouter({
  routeTree: root.addChildren(destinations),
  history: createMemoryHistory({ initialEntries: ['/events'] })
})
// Keep the requested fixture theme across document reloads as well as initial rendering.
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark')
const container = document.getElementById('root')
if (!container) throw new Error('Missing test root')
createRoot(container).render(
  <Provider>
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion='always'>
          <RouterProvider router={router} />
        </MotionConfig>
      </QueryClientProvider>
    </TooltipProvider>
  </Provider>
)
