import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { Route as LocationRoute } from '@/app/routes/location'
import type { StoreData } from '@/schemas/store.dto'
import '@/index.css'

const invalid = [
  undefined,
  null,
  { latitude: Number.NaN, longitude: 139 },
  { latitude: 35, longitude: Number.NaN },
  { latitude: Number.POSITIVE_INFINITY, longitude: 139 },
  { latitude: 35, longitude: Number.NEGATIVE_INFINITY },
  { latitude: 91, longitude: 139 },
  { latitude: -91, longitude: 139 },
  { latitude: 35, longitude: 181 },
  { latitude: 35, longitude: -181 }
]
const fixture = (id: string, coordinates: StoreData['coordinates']): StoreData => ({
  id,
  character: {
    name: id === 'valid' ? '有効店舗' : `未登録店舗${id}`,
    description: 'テスト店舗',
    images: ['fixture.webp'],
    image_url: ''
  },
  prefecture: '東京都',
  region: 'kanto',
  store: { address: 'テスト住所', access: [] },
  coordinates
})
const queryClient = new QueryClient()
queryClient.setQueryData(
  ['characters'],
  [
    fixture('valid', { latitude: 34.7, longitude: 135.5 }),
    ...invalid.map((coords, i) => fixture(`invalid-${i}`, coords)),
    fixture('boundary', { latitude: -90, longitude: 180 }),
    fixture('boundary-other', { latitude: 90, longitude: -180 }),
    fixture('zero', { latitude: 0, longitude: 0 })
  ]
)
const rootRoute = createRootRoute({ component: () => <Outlet /> })
const routeOptions = { ...LocationRoute.options, id: '/location/', path: '/location/', getParentRoute: () => rootRoute }
const locationRoute = LocationRoute.update(routeOptions)
const router = createRouter({ routeTree: rootRoute.addChildren([locationRoute]) })
const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
