import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Provider } from 'jotai'
import { MotionConfig } from 'motion/react'
import { createRoot } from 'react-dom/client'
import { Route } from '@/app/routes/characters/index'
import { TooltipProvider } from '@/components/ui/tooltip'
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

const root = createRootRoute({ component: Route.options.component })
const router = createRouter({
  routeTree: root.addChildren([
    createRoute({ path: '/characters/$id', getParentRoute: () => root, component: () => null })
  ]),
  history: createMemoryHistory({ initialEntries: ['/'] })
})
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark')
const container = document.getElementById('root')
if (!container) throw new Error('Missing root')
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
