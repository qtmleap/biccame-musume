import { createFileRoute } from '@tanstack/react-router'
import { Loader2, MapPin, Route as RouteIcon } from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import {
  type AvailableStore,
  type RouteResult,
  RouteResultCard,
  type SelectedStore,
  SelectedStoreList,
  StoreSelect,
  useDirections
} from '@/components/route'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/use-characters'
import { calcGreatCircleKm, solveTsp } from '@/utils/tsp'

export const Route = createFileRoute('/route/')({
  component: RouteComponent
})

// 京都駅の座標
const KYOTO_STATION = { lat: 34.9856, lng: 135.7588 }

/**
 * 店舗選択と訪問順計算のメインコンポーネント
 */
const RouteCalculator = () => {
  const { data: characters } = useCharacters()
  const [selectedStores, setSelectedStores] = useState<SelectedStore[]>([])
  const [result, setResult] = useState<RouteResult | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)

  const { getDirections, calcTotalDuration } = useDirections()
  const requestGeneration = useRef(0)
  const pendingRequest = useRef<AbortController | null>(null)

  const cancelRequest = useCallback(() => {
    requestGeneration.current += 1
    pendingRequest.current?.abort()
    pendingRequest.current = null
  }, [])

  const invalidateResult = useCallback(() => {
    cancelRequest()
    setResult(null)
    setIsCalculating(false)
  }, [cancelRequest])

  useEffect(() => cancelRequest, [cancelRequest])

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
        .sort((a, b) => calcGreatCircleKm(KYOTO_STATION, a) - calcGreatCircleKm(KYOTO_STATION, b)),
    [characters]
  )

  // まだ選択されていない店舗
  const unselectedStores = useMemo(
    () => availableStores.filter((store) => !selectedStores.some((s) => s.id === store.id)),
    [availableStores, selectedStores]
  )

  /**
   * 店舗を追加（最大5店舗まで）
   */
  const handleAddStore = useCallback(
    (storeId: string) => {
      if (selectedStores.length >= 5) return
      const store = availableStores.find((s) => s.id === storeId)
      if (store) {
        setSelectedStores((prev) => [
          ...prev,
          {
            ...store,
            station: store.stations[0]
          }
        ])
        invalidateResult()
      }
    },
    [availableStores, selectedStores.length, invalidateResult]
  )

  /**
   * 店舗を削除
   */
  const handleRemoveStore = useCallback(
    (storeId: string) => {
      setSelectedStores((prev) => prev.filter((s) => s.id !== storeId))
      invalidateResult()
    },
    [invalidateResult]
  )

  /**
   * 駅を変更
   */
  const handleChangeStation = useCallback(
    (storeId: string, station: string) => {
      setSelectedStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, station } : s)))
      invalidateResult()
    },
    [invalidateResult]
  )

  /**
   * 全店舗をクリア
   */
  const handleClearAll = useCallback(() => {
    setSelectedStores([])
    invalidateResult()
  }, [invalidateResult])

  /**
   * 訪問順を計算してAPIで詳細を取得
   */
  const handleCalculate = useCallback(async () => {
    if (
      selectedStores.length < 2 ||
      selectedStores.length > 5 ||
      selectedStores.some((store) => !store.station?.trim())
    )
      return

    cancelRequest()
    const generation = requestGeneration.current
    const controller = new AbortController()
    pendingRequest.current = controller
    setIsCalculating(true)

    try {
      // TSPで訪問順を計算
      const tspResult = solveTsp(selectedStores)
      const directions = await getDirections(tspResult.route, controller.signal)
      // 通信が中止に対応しない場合も、古い入力の結果は反映しない。
      if (generation !== requestGeneration.current) return
      setResult({
        route: tspResult.route,
        totalDistance: tspResult.totalDistance,
        ...directions,
        totalDuration: directions.status === 'estimated' ? calcTotalDuration(directions.legs) : undefined
      })
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof Error && error.name === 'AbortError')) {
        console.error('Route calculation error:', error)
      }
    } finally {
      if (generation === requestGeneration.current) {
        pendingRequest.current = null
        setIsCalculating(false)
      }
    }
  }, [selectedStores, getDirections, calcTotalDuration, cancelRequest])

  // 駅が指定されていない店舗があるかチェック
  const hasInvalidStation = useMemo(
    () => selectedStores.some((store) => !store.station || store.station.trim() === ''),
    [selectedStores]
  )

  const inputExplanation =
    selectedStores.length === 0
      ? 'まず店舗を2〜5件選択してください。'
      : selectedStores.length === 1
        ? 'あと1店舗選択してください（現在1件）。'
        : hasInvalidStation
          ? '利用駅が未設定の店舗があります。各店舗の利用駅を確認してください。'
          : isCalculating
            ? '訪問順を計算しています。'
            : '利用駅を確認したら、訪問順を計算できます。'

  return (
    <div className='mx-auto max-w-3xl space-y-6 px-4 py-2 text-foreground md:py-4 md:px-8'>
      <h1 className='flex items-center gap-2 text-xl font-bold'>
        <RouteIcon className='size-5' />
        ルート計算
      </h1>

      <section aria-label='ルート計算の入力' className='space-y-4'>
        <ol aria-label='ルート計算の手順' className='grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-3'>
          {['店舗を2〜5件選択', '利用駅を確認', '訪問順を計算'].map((step, index) => (
            <li key={step} className='flex items-start gap-2'>
              <span
                className='flex size-6 shrink-0 items-center justify-center rounded-full border text-xs'
                aria-hidden='true'
              >
                {index + 1}
              </span>
              <span className='pt-0.5 font-medium'>{step}</span>
            </li>
          ))}
        </ol>
        <StoreSelect stores={unselectedStores} onSelect={handleAddStore} disabled={selectedStores.length >= 5} />

        <SelectedStoreList
          stores={selectedStores}
          onRemove={handleRemoveStore}
          onChangeStation={handleChangeStation}
          onClearAll={handleClearAll}
        />

        <p id='route-input-explanation' role='status' className='text-sm'>
          {inputExplanation}
        </p>
        <Button
          aria-describedby='route-input-explanation route-reference-explanation'
          variant='outline'
          className='w-full'
          disabled={selectedStores.length < 2 || isCalculating || hasInvalidStation}
          onClick={handleCalculate}
        >
          {isCalculating ? (
            <>
              <Loader2 className='size-4 animate-spin' />
              探索中...
            </>
          ) : (
            <>
              <MapPin className='size-4' />
              訪問順を計算
            </>
          )}
        </Button>
        <p id='route-reference-explanation' className='text-sm text-muted-foreground'>
          店舗間の直線距離を基準に訪問順を計算します。計算時に取得するAIによる参考経路は、交通機関での最短経路を保証するものではありません。外部経路検索で確認してください。
        </p>
      </section>

      {result && <RouteResultCard result={result} />}
    </div>
  )
}

function RouteComponent() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RouteCalculator />
    </Suspense>
  )
}
