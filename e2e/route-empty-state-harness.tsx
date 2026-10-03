import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import './route-empty-state.css'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/zen-maru-gothic/400.css'
import '@fontsource/zen-maru-gothic/500.css'
import '@fontsource/zen-maru-gothic/700.css'
import '@fontsource/m-plus-1-code/400.css'
import '@fontsource/m-plus-1-code/500.css'
import '@fontsource/m-plus-1-code/700.css'
import { createRoot } from 'react-dom/client'
import { Route } from '@/app/routes/route'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
queryClient.setQueryData(
  ['characters'],
  [
    {
      id: 'a',
      character: { name: '店舗A' },
      coordinates: { latitude: 35, longitude: 135 },
      store: { name: 'A', access: [{ station: '東京' }, { station: '新宿' }] }
    },
    {
      id: 'b',
      character: { name: '店舗B' },
      coordinates: { latitude: 35, longitude: 136 },
      store: { name: 'B', access: [{ station: '大阪' }] }
    },
    {
      id: 'c',
      character: { name: 'とても長い名称の店舗C・駅前本館' },
      coordinates: { latitude: 35, longitude: 137 },
      store: { name: 'C', access: [{ station: '京都' }] }
    },
    {
      id: 'd',
      character: { name: '駅未設定の店舗' },
      coordinates: { latitude: 36, longitude: 137 },
      store: { name: 'D', access: [{ station: ' ' }] }
    },
    ...['e', 'f'].map((id) => ({
      id,
      character: { name: `店舗${id.toUpperCase()}` },
      coordinates: { latitude: 36, longitude: 138 },
      store: { name: id, access: [{ station: '京都' }] }
    }))
  ]
)
const Page = Route.options.component
if (!Page) throw new Error('Route page component is missing')
const App = () => {
  const [mounted, setMounted] = useState(true)
  return (
    <QueryClientProvider client={queryClient}>
      <button hidden type='button' onClick={() => setMounted(false)}>
        Unmount page
      </button>
      {mounted && <Page />}
    </QueryClientProvider>
  )
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
