import { createFileRoute } from '@tanstack/react-router'
import { AdvancedMarker, APIProvider, Map as GoogleMap, Pin, useMap } from '@vis.gl/react-google-maps'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { StoreList } from '@/components/location/store-list'
import { SelectedStoreInfo } from '@/components/selected-store-info'
import { useCharacters } from '@/hooks/use-characters'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { StoreData } from '@/schemas/store.dto'
import { clusterStores, getStoreBounds } from '@/utils/map-layout'
import { getStorePosition } from '@/utils/store-position'

/**
 * 検索パラメータのスキーマ
 */
const SearchParamsSchema = z.object({
  id: z.string().optional()
})

/**
 * マップ内部コンポーネント（useMapはAPIProviderの子から呼ぶ必要がある）
 */
const LocationMapInner = ({
  characters,
  selectedCharacter,
  setSelectedCharacter,
  isStoreListOpen,
  setIsStoreListOpen,
  hasInitialSelection
}: {
  characters: StoreData[]
  selectedCharacter: StoreData | null
  setSelectedCharacter: (c: StoreData | null) => void
  hasInitialSelection: boolean
  isStoreListOpen: boolean
  setIsStoreListOpen: (v: boolean) => void
}) => {
  const selectedPosition = selectedCharacter ? getStorePosition(selectedCharacter) : null
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral | null>(null)
  const [zoom, setZoom] = useState(selectedPosition ? 17 : 5)
  const [region, setRegion] = useState('all')
  const map = useMap()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const [selectedPanel, setSelectedPanel] = useState<HTMLDivElement | null>(null)
  const [panel, setPanel] = useState<HTMLElement | null>(null)
  const [layout, setLayout] = useState({ height: 0, top: 24, bottom: 24, left: 24, right: 24 })
  const [target, setTarget] = useState<{ stores: StoreData[]; individual: boolean } | null>(() =>
    selectedPosition && selectedCharacter
      ? { stores: [selectedCharacter], individual: true }
      : hasInitialSelection
        ? null
        : { stores: characters, individual: false }
  )
  const clusters = useMemo(() => clusterStores(characters, zoom), [characters, zoom])
  const regions = [
    { id: 'hokkaido', label: '北海道' },
    { id: 'kanto', label: '関東' },
    { id: 'chubu', label: '中部' },
    { id: 'kansai', label: '関西・中国・四国' },
    { id: 'kyushu', label: '九州' }
  ]

  // 実際のヘッダー・カード・一覧/Sheetの矩形から、地図を操作できる領域を測る。
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const header = document.querySelector('header')
    const measure = () => {
      const box = container.getBoundingClientRect()
      const height = Math.max(320, window.innerHeight - box.top)
      const controls = controlsRef.current?.getBoundingClientRect()
      const info = selectedPanel?.getBoundingClientRect()
      const list = panel?.getBoundingClientRect()
      const next = {
        height,
        top: Math.max(
          24,
          controls ? controls.bottom - box.top + 24 : 24,
          header ? header.getBoundingClientRect().bottom - box.top + 24 : 24
        ),
        bottom: Math.max(
          24,
          info ? box.top + height - info.top + 24 : 24,
          list && !isDesktop ? box.top + height - list.top + 24 : 24
        ),
        left: list && isDesktop ? list.right - box.left + 24 : 24,
        right: 24
      }
      setLayout((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next))
    }
    const observer = new ResizeObserver(measure)
    for (const element of [container, controlsRef.current, selectedPanel, panel, header])
      if (element) observer.observe(element)
    // SheetのtransformはResizeObserverの対象外なので、移動完了時も実際の矩形を測る。
    const onMotionSettled = (event: Event) => {
      if (event.target === panel) measure()
    }
    const motionEvents = ['animationend', 'animationcancel', 'transitionend', 'transitioncancel']
    for (const name of motionEvents) panel?.addEventListener(name, onMotionSettled)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      for (const name of motionEvents) panel?.removeEventListener(name, onMotionSettled)
      window.removeEventListener('resize', measure)
    }
  }, [panel, isDesktop, selectedPanel])

  useEffect(() => {
    if (!map || !target || !layout.height) return
    const { top, bottom, left, right } = layout
    const padding = { top, bottom, left, right }
    const position = target.individual ? getStorePosition(target.stores[0]) : null
    if (position) {
      // 絶対位置へ戻してから一度だけオフセット。再選択/リサイズでも累積しない。
      map.moveCamera({ center: position, zoom: 17, heading: 0, tilt: 0 })
      map.panBy((right - left) / 2, (bottom - top) / 2)
    } else {
      const bounds = getStoreBounds(target.stores)
      if (bounds) map.fitBounds(bounds, padding)
    }
  }, [map, target, layout])

  const select = (character: StoreData, closeList: boolean) => {
    setSelectedCharacter(character)
    setTarget(getStorePosition(character) ? { stores: [character], individual: true } : null)
    if (closeList) setIsStoreListOpen(false)
  }
  const fit = (stores: StoreData[]) => {
    setSelectedCharacter(null)
    setTarget(getStoreBounds(stores) ? { stores, individual: false } : null)
  }
  return (
    <div
      ref={containerRef}
      className='relative w-full'
      style={{ height: layout.height ? `${layout.height}px` : 'calc(100dvh - 3.5rem)' }}
    >
      <GoogleMap
        defaultCenter={selectedPosition ? selectedPosition : { lat: 35.6812, lng: 139.7671 }}
        defaultZoom={selectedPosition ? 17 : 5}
        mapId='biccamera-stores-map'
        gestureHandling='greedy'
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        minZoom={0}
        maxZoom={18}
        onCenterChanged={(event) => setMapCenter(event.detail.center)}
        onZoomChanged={(event) => setZoom(event.detail.zoom)}
      >
        {clusters.map((cluster) => (
          <AdvancedMarker
            key={cluster.key}
            position={cluster.position}
            title={
              cluster.stores.length > 1
                ? `${cluster.stores.length}店舗を拡大`
                : `${cluster.stores[0].character.name}を選択`
            }
            onClick={() => (cluster.stores.length > 1 ? fit(cluster.stores) : select(cluster.stores[0], false))}
          >
            {cluster.stores.length > 1 ? (
              <span className='flex size-12 items-center justify-center rounded-full border-2 border-white bg-[#b90010] text-base font-bold text-white shadow-lg'>
                {cluster.stores.length}
              </span>
            ) : (
              <Pin background='#e50012' borderColor='#fef2f4' glyphColor='#fef2f4' />
            )}
          </AdvancedMarker>
        ))}
      </GoogleMap>
      <div
        ref={controlsRef}
        className='absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center gap-2 rounded-lg bg-card p-2 text-sm text-foreground shadow-lg md:right-auto'
      >
        <label className='flex items-center gap-2'>
          地域
          <select
            aria-label='地域'
            value={region}
            className='min-h-11 max-w-44 rounded-md border-0 bg-muted px-2 text-foreground focus-visible:outline-2 focus-visible:outline-primary'
            onChange={(event) => {
              const next = event.target.value
              setRegion(next)
              fit(next === 'all' ? characters : characters.filter((c) => c.region === next))
            }}
          >
            <option value='all'>全国</option>
            {regions.map((r) => (
              <option
                key={r.id}
                value={r.id}
                disabled={!characters.some((c) => c.region === r.id && getStorePosition(c))}
              >
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type='button'
          className='min-h-11 rounded-md bg-muted px-3 text-foreground hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-primary'
          disabled={!getStoreBounds(characters)}
          onClick={() => {
            setRegion('all')
            fit(characters)
          }}
        >
          全店舗を表示
        </button>
      </div>
      {selectedCharacter && (
        <div
          ref={setSelectedPanel}
          className='absolute bottom-20 left-4 right-4 z-10 rounded-lg bg-card p-3 text-foreground shadow-lg md:bottom-4 md:left-[20rem] md:max-w-md'
        >
          <SelectedStoreInfo character={selectedCharacter} />
        </div>
      )}
      <StoreList
        characters={characters}
        isOpen={isStoreListOpen}
        onOpenChange={setIsStoreListOpen}
        onCharacterSelect={(character) => select(character, true)}
        mapCenter={mapCenter}
        onPanelChange={setPanel}
      />
    </div>
  )
}

/**
 * 店舗位置マップ本体
 */
const LocationContent = () => {
  const { id: initialCharacterId } = Route.useSearch()
  const { data: characters } = useCharacters()
  const [selectedCharacter, setSelectedCharacter] = useState<StoreData | null>(() => {
    if (initialCharacterId) {
      const targetCharacter = characters.find((c) => c.id === initialCharacterId)
      return targetCharacter ? targetCharacter : null
    }
    return null
  })
  const [isStoreListOpen, setIsStoreListOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  const charactersWithAddress = characters.filter((char) => char.store?.address && char.store.address.length > 0)

  if (!apiKey) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <p className='text-destructive mb-2'>Google Maps APIキーが設定されていません</p>
          <p className='text-sm text-muted-foreground'>.envファイルにVITE_GOOGLE_MAPS_API_KEYを設定してください</p>
        </div>
      </div>
    )
  }

  return (
    <APIProvider apiKey={apiKey}>
      <section className='relative w-full h-full overflow-hidden' aria-label='地図'>
        <LocationMapInner
          hasInitialSelection={Boolean(initialCharacterId)}
          characters={charactersWithAddress}
          selectedCharacter={selectedCharacter}
          setSelectedCharacter={setSelectedCharacter}
          isStoreListOpen={isStoreListOpen}
          setIsStoreListOpen={setIsStoreListOpen}
        />
      </section>
    </APIProvider>
  )
}

/**
 * 店舗位置マップページ
 */
const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <LocationContent />
  </Suspense>
)

export const Route = createFileRoute('/location/')({
  component: RouteComponent,
  validateSearch: SearchParamsSchema
})
