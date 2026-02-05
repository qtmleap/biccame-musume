import { createFileRoute } from '@tanstack/react-router'
import { MapPin, Route as RouteIcon, Trash2, X } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCharacters } from '@/hooks/useCharacters'
import { solveTsp } from '@/utils/tsp'

export const Route = createFileRoute('/route/')({
  component: RouteComponent
})

type SelectedStore = {
  id: string
  name: string
  lat: number
  lng: number
}

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
  const [result, setResult] = useState<{ route: SelectedStore[]; totalDistance: number } | null>(null)

  // 座標を持つ店舗のみフィルタリング（京都駅から近い順）
  const availableStores = useMemo(
    () =>
      characters
        .filter(
          (c): c is typeof c & { coordinates: NonNullable<typeof c.coordinates>; store: NonNullable<typeof c.store> } =>
            Boolean(c.coordinates?.latitude && c.coordinates?.longitude && c.store?.name)
        )
        .map((c) => ({
          id: c.id,
          name: c.character.name,
          lat: c.coordinates.latitude,
          lng: c.coordinates.longitude
        }))
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
  const handleAddStore = (storeId: string) => {
    const store = availableStores.find((s) => s.id === storeId)
    if (store) {
      setSelectedStores((prev) => [...prev, store])
      setResult(null)
    }
  }

  /**
   * 店舗を削除
   */
  const handleRemoveStore = (storeId: string) => {
    setSelectedStores((prev) => prev.filter((s) => s.id !== storeId))
    setResult(null)
  }

  /**
   * 全店舗をクリア
   */
  const handleClearAll = () => {
    setSelectedStores([])
    setResult(null)
  }

  /**
   * 最短ルートを計算
   */
  const handleCalculate = () => {
    if (selectedStores.length < 2) return
    const tspResult = solveTsp(selectedStores)
    setResult(tspResult)
  }

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
          {/* 店舗追加セレクト */}
          <div className='flex gap-2'>
            <Select onValueChange={handleAddStore} value=''>
              <SelectTrigger className='flex-1'>
                <SelectValue placeholder='店舗を追加...' />
              </SelectTrigger>
              <SelectContent>
                {unselectedStores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 選択済み店舗リスト */}
          {selectedStores.length > 0 && (
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground text-sm'>選択中: {selectedStores.length}店舗</span>
                <Button variant='ghost' size='sm' onClick={handleClearAll}>
                  <Trash2 className='size-4' />
                  全てクリア
                </Button>
              </div>
              <div className='flex flex-wrap gap-2'>
                {selectedStores.map((store, index) => (
                  <div
                    key={store.id}
                    className='bg-secondary flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm'
                  >
                    <span className='text-muted-foreground mr-1'>{index + 1}.</span>
                    {store.name}
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      className='size-6 rounded-full'
                      onClick={() => handleRemoveStore(store.id)}
                    >
                      <X className='size-3' />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 計算ボタン */}
          <Button className='w-full' disabled={selectedStores.length < 2} onClick={handleCalculate}>
            <MapPin className='size-4' />
            最短ルートを計算
          </Button>
        </CardContent>
      </Card>

      {/* 結果表示 */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>計算結果</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='bg-primary/10 text-primary rounded-lg p-4 text-center'>
              <div className='text-sm'>総移動距離（概算）</div>
              <div className='text-2xl font-bold'>{(result.totalDistance * 111).toFixed(1)} km</div>
              <div className='text-muted-foreground text-xs'>緯度経度ベースの概算値</div>
            </div>

            <div className='space-y-2'>
              <div className='font-medium'>最短ルート順序</div>
              <div className='space-y-0'>
                {result.route.map((store, index) => {
                  const nextStore = result.route[index + 1]
                  const distance = nextStore ? calcDistance(store, nextStore) * 111 : null

                  return (
                    <div key={store.id}>
                      <div className='flex items-center gap-2 py-2 text-sm'>
                        <span className='bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs'>
                          {index + 1}
                        </span>
                        <span>{store.name}</span>
                      </div>
                      {distance !== null && (
                        <div className='text-muted-foreground ml-3 flex items-center gap-1 border-l-2 py-1 pl-4 text-xs'>
                          <span>↓</span>
                          <span>{distance.toFixed(1)} km</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
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
