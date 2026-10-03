import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { Route as CalendarRoute } from '@/app/routes/calendar/index'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { StoreData } from '@/schemas/store.dto'
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

const characters: StoreData[] = [
  {
    id: 'okayama',
    region: undefined,
    prefecture: '岡山県',
    character: {
      name: '岡山たん',
      description: '合成テストデータ',
      images: ['fixture.webp'],
      image_url: '/images/fixture.webp',
      birthday: '2016-10-02'
    },
    store: { name: 'ビックカメラ岡山駅前店', access: [] }
  },
  {
    id: 'takatsuki',
    region: 'kansai',
    prefecture: '大阪府',
    character: {
      name: '高槻たん',
      description: '合成テストデータ',
      images: ['fixture.webp'],
      image_url: '/images/fixture.webp',
      birthday: '2016-10-03'
    },
    store: { name: 'ビックカメラ高槻阪急スクエア店', access: [] }
  }
]
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
queryClient.setQueryData(['characters'], characters)
const root = createRootRoute({ component: () => <Outlet /> })
const calendar = createRoute({ path: '/', getParentRoute: () => root, component: CalendarRoute.options.component })
const detail = createRoute({
  path: '/characters/$id',
  getParentRoute: () => root,
  component: () => <div>詳細ページ到達</div>
})
const router = createRouter({ routeTree: root.addChildren([calendar, detail]) })
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark')
const container = document.getElementById('root')
if (!container) throw new Error('Missing test root')
createRoot(container).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </QueryClientProvider>
)
