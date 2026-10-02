import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { Provider } from 'jotai'
import { createRoot } from 'react-dom/client'
import { Route as EventsRoute } from '@/app/routes/events/index'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark')
const root = createRootRoute({ component: Outlet })
const events = createRoute({
  path: '/events/',
  getParentRoute: () => root,
  component: EventsRoute.options.component,
  validateSearch: EventsRoute.options.validateSearch
})
const router = createRouter({ routeTree: root.addChildren([events]) })
const container = document.getElementById('root')
if (!container) throw new Error('Missing fixture root')
createRoot(container).render(
  <Provider>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </Provider>
)
