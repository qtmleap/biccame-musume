import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Route } from '@/app/routes/route'

const queryClient = new QueryClient()
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
      character: { name: '店舗C' },
      coordinates: { latitude: 35, longitude: 137 },
      store: { name: 'C', access: [{ station: '京都' }] }
    }
  ]
)
const Page = Route.options.component
if (!Page) throw new Error('Route page component is missing')
const App = () => {
  const [mounted, setMounted] = useState(true)
  return (
    <QueryClientProvider client={queryClient}>
      <button type='button' onClick={() => setMounted(false)}>
        Unmount page
      </button>
      {mounted && <Page />}
    </QueryClientProvider>
  )
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
