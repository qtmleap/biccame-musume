import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouteResultCard } from '@/components/route/route-result'
import type { RouteResult } from '@/components/route/types'
import { useDirections } from '@/components/route/use-directions'

const stores = [
  { id: 'a', name: '店舗A', lat: 35, lng: 135, station: '東京', stations: ['東京'] },
  { id: 'b', name: '店舗B', lat: 35, lng: 136, station: '大阪', stations: ['大阪'] }
]
function App() {
  const { getDirections, calcTotalDuration } = useDirections()
  const [result, setResult] = useState<RouteResult | null>(null)
  useEffect(() => {
    void getDirections(stores).then((data) =>
      setResult({
        route: stores,
        totalDistance: 91.085,
        ...data,
        totalDuration: data.status === 'unavailable' ? undefined : calcTotalDuration(data.legs)
      })
    )
  }, [getDirections, calcTotalDuration])
  return result ? <RouteResultCard result={result} /> : 'loading'
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
