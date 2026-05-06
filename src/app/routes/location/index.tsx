import { createFileRoute } from '@tanstack/react-router'
import { AdvancedMarker, APIProvider, Map as GoogleMap, Pin, useMap } from '@vis.gl/react-google-maps'
import { Suspense, useCallback, useState } from 'react'
import { z } from 'zod'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { StoreList } from '@/components/location/store-list'
import { SelectedStoreInfo } from '@/components/selected-store-info'
import { useCharacters } from '@/hooks/use-characters'
import type { StoreData } from '@/schemas/store.dto'

/**
 * 検索パラメータのスキーマ
 */
const SearchParamsSchema = z.object({
  id: z.string().optional()
})

/**
 * キャラクターから座標を取得する関数
 */
const getPosition = (character: StoreData): google.maps.LatLngLiteral => {
  if (character.coordinates) {
    return { lat: character.coordinates.latitude, lng: character.coordinates.longitude }
  }
  return { lat: 35.6812, lng: 139.7671 }
}

/**
 * マップ内部コンポーネント（useMapはAPIProviderの子から呼ぶ必要がある）
 */
const LocationMapInner = ({
  characters,
  selectedCharacter,
  setSelectedCharacter,
  isStoreListOpen,
  setIsStoreListOpen
}: {
  characters: StoreData[]
  selectedCharacter: StoreData | null
  setSelectedCharacter: (c: StoreData) => void
  isStoreListOpen: boolean
  setIsStoreListOpen: (v: boolean) => void
}) => {
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral | null>(null)
  const map = useMap()

  const moveToCharacter = useCallback(
    (character: StoreData) => {
      const pos = getPosition(character)
      if (map) {
        map.panTo(pos)
        map.setZoom(17)
      }
    },
    [map]
  )

  const handleMarkerClick = (character: StoreData) => {
    setSelectedCharacter(character)
    moveToCharacter(character)
  }

  const handleCharacterSelect = (character: StoreData) => {
    setSelectedCharacter(character)
    moveToCharacter(character)
    setIsStoreListOpen(false)
  }

  return (
    <>
      <GoogleMap
        defaultCenter={selectedCharacter ? getPosition(selectedCharacter) : { lat: 35.6812, lng: 139.7671 }}
        defaultZoom={selectedCharacter ? 17 : 5}
        mapId='biccamera-stores-map'
        gestureHandling='greedy'
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        minZoom={5}
        maxZoom={18}
        onCenterChanged={(e) => {
          if (e.detail.center) {
            setMapCenter(e.detail.center)
          }
        }}
      >
        {characters.map((character) => {
          const position = getPosition(character)
          return (
            <AdvancedMarker key={character.id} position={position} onClick={() => handleMarkerClick(character)}>
              <Pin background='#e50012' borderColor='#fef2f4' glyphColor='#fef2f4' />
            </AdvancedMarker>
          )
        })}
      </GoogleMap>

      {selectedCharacter && (
        <div className='absolute top-4 left-4 right-4 bg-card rounded-lg shadow-lg p-3 max-w-md z-10'>
          <SelectedStoreInfo character={selectedCharacter} />
        </div>
      )}

      <StoreList
        characters={characters}
        isOpen={isStoreListOpen}
        onOpenChange={setIsStoreListOpen}
        onCharacterSelect={handleCharacterSelect}
        mapCenter={mapCenter}
      />
    </>
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
      return targetCharacter || null
    }
    return null
  })
  const [isStoreListOpen, setIsStoreListOpen] = useState(false)
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
      <section
        className='relative w-full overflow-hidden h-[min(calc(100dvh-9rem),800px)] md:h-[min(calc(100dvh-9.5rem),800px)]'
        aria-label='地図'
      >
        <LocationMapInner
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
