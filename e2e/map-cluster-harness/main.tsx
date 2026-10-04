import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { Route as LocationRoute } from '@/app/routes/location'
import { Header } from '@/components/common/header'
import type { StoreData } from '@/schemas/store.dto'
import './styles.css'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/zen-maru-gothic/400.css'
import '@fontsource/zen-maru-gothic/500.css'
import '@fontsource/zen-maru-gothic/700.css'
import '@fontsource/m-plus-1-code/400.css'
import '@fontsource/m-plus-1-code/500.css'
import '@fontsource/m-plus-1-code/700.css'

const fixture = (id: string, name: string, region: StoreData['region'], lat?: number, lng?: number): StoreData => ({
  id,
  character: { name, description: 'テスト店舗', images: ['fixture.webp'], image_url: '' },
  prefecture: region === 'kansai' ? '大阪府' : '東京都',
  region,
  store: { address: 'テスト住所', access: [] },
  coordinates: lat === undefined || lng === undefined ? null : { latitude: lat, longitude: lng }
})
const style = document.createElement('style')
style.textContent =
  'main {height:calc(100dvh - 49px)} @media(min-width:768px) {main {height:calc(100dvh - 57px)}} *,*::before,*::after {animation:none!important;transition:none!important}'
document.head.appendChild(style)
const characters = [
  fixture('tokyo-a', '東京店舗A', 'kanto', 35.68, 139.76),
  fixture('tokyo-b', '東京店舗B', 'kanto', 35.6801, 139.7601),
  fixture('tokyo-c', '東京店舗C', 'kanto', 35.681, 139.762),
  fixture('osaka-a', '大阪店舗A', 'kansai', 34.7, 135.5),
  fixture('osaka-b', '大阪店舗B', 'kansai', 34.701, 135.501),
  fixture('sapporo', '札幌店舗', 'hokkaido', 43.06, 141.35),
  fixture('fukuoka', '福岡店舗', 'kyushu', 33.59, 130.4),
  fixture('missing', '位置未登録店舗', 'kanto')
]
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
queryClient.setQueryData(['characters'], characters)
const rootRoute = createRootRoute({
  component: () => (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
    </>
  )
})
const routeOptions = { ...LocationRoute.options, id: '/location/', path: '/location/', getParentRoute: () => rootRoute }
const locationRoute = LocationRoute.update(routeOptions)
const router = createRouter({ routeTree: rootRoute.addChildren([locationRoute]) })
const root = document.getElementById('root')
if (root) root.dataset.fixtureIds = JSON.stringify(characters.map((character) => character.id))
if (root)
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
