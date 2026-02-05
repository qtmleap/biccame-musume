import { createFileRoute } from '@tanstack/react-router'
import { Loader2, MapPin, Route as RouteIcon } from 'lucide-react'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  StoreSelect,
  SelectedStoreList,
  RouteResultCard,
  useDirections,
  type AvailableStore,
  type SelectedStore,
  type RouteResult
} from '@/components/route'
import { useCharacters } from '@/hooks/useCharacters'
import { solveTsp } from '@/utils/tsp'

export const Route = createFileRoute('/route/')({
  component: RouteComponent
})

// 京都駅の座標
const KYOTO_STATION = { lat: 34.9856, lng: 135.7588 }

/**
 * 2点間のユークリッド距離を計算
 */
const calcDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
  const dx = p2.lat - p1.lat
  const dy = p2.lng - p1.lng
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * 店舗選択と最短ルート計算のメインコンポーネント
 */
const RouteCalculator = () => {
  const { data: characters } = useCharacters()
  const [selectedStores, setSelectedStores] = useState<SelectedStore[]>([])
  const [result, setResult] = useState<RouteResult | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)

  const { getDirections, calcTotalDuration } = useDirections()

  // 座標を持つ店舗のみフィルタリング（京都駅から近い順）
  const availableStores = useMemo<AvailableStore[]>(
    () =>
      characters
        .filter(
          (c): c is typeof c & { coordinates: NonNullable<typeof c.coordinates>; store: NonNullable<typeof c.store> } =>
            Boolean(c.coordinates?.latitude && c.coordinates?.longitude && c.store?.name && c.store.access?.length)
        )
        .map((c) => {
          const stations = [...new Set(c.store.access?.map((a) => a.station).filter(Boolean) || [])]
          return {
            id: c.id,
            name: c.character.name,
            lat: c.coordinates.latitude,
            lng: c.coordinates.longitude,
            stations
          }
        })
        .filter((s) => s.stations.length > 0)
        .sort((a, b) => calcDistance(KYOTO_STATION, a) - calcDistance(KYOTO_STATION, b)),
    [characters]
  )

  // まだ選択されていない店舗
  const unselectedStores = useMemo(
    () => availableStores.filter((store) => !selectedStores.some((s) => s.id === store.id)),
    [availableStores, selectedStores]
  )

  /**
   * 店舗を追加
   */
  const handleAddStore = useCallback(
    (storeId: string) => {
      const store = availableStores.find((s) => s.id === storeId)
      if (store) {
        setSelectedStores((prev) => [
          ...prev,
          {
            ...store,
            station: store.stations[0]
          }
        ])
        setResult(null)
      }
    },
    [availableStores]
  )

  /**
   * 店舗を削除
   */
  const handleRemoveStore = useCallback((storeId: string) => {
    setSelectedStores((prev) => prev.filter((s) => s.id !== storeId))
    setResult(null)
  }, [])

  /**
   * 駅を変更
   */
  const handleChangeStation = useCallback((storeId: string, station: string) => {
    setSelectedStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, station } : s)))
    setResult(null)
  }, [])

  /**
   * 全店舗をクリア
   */
  const handleClearAll = useCallback(() => {
    setSelectedStores([])
    setResult(null)
  }, [])

  /**
   * 最短ルートを計算してAPIで詳細を取得
   */
  const handleCalculate = useCallback(async () => {
    if (selectedStores.length < 2) return

    setIsCalculating(true)

    // TSPで最短ルートを計算
    const tspResult = solveTsp(selectedStores)

    // APIで経路情報を取得
    const legs = await getDirections(tspResult.route)

    setResult({
      route: tspResult.route,
      totalDistance: tspResult.totalDistance,
      legs,
      totalDuration: calcTotalDuration(legs)
    })
    setIsCalculating(false)
  }, [selectedStores, getDirections, calcTotalDuration])

  return (
    <div className='container mx-auto max-w-2xl space-y-6 p-4'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <RouteIcon className='size-5' />
            ルート計算
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <StoreSelect stores={unselectedStores} onSelect={handleAddStore} />

          <SelectedStoreList
            stores={selectedStores}
            onRemove={handleRemoveStore}
            onChangeStation={handleChangeStation}
            onClearAll={handleClearAll}
          />

          <Button
            variant='outline'
            className='w-full'
            disabled={selectedStores.length < 2 || isCalculating}
            onClick={handleCalculate}
          >
            {isCalculating ? (
              <>
                <Loader2 className='size-4 animate-spin' />
                計算中...
              </>
            ) : (
              <>
                <MapPin className='size-4' />
                最短ルートを計算
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && <RouteResultCard result={result} />}
    </div>
  )
}

function RouteComponent() {
  return (
    <Suspense fallback={<div className='p-4 text-center'>読み込み中...</div>}>
      <RouteCalculator />
    </Suspense>
  )
}
