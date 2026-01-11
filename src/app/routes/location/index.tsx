import { createFileRoute } from '@tanstack/react-router'
import { AdvancedMarker, APIProvider, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps'
import { useState } from 'react'
import { z } from 'zod'
import { StoreList } from '@/components/location/store-list'
import { SelectedStoreInfo } from '@/components/selected-store-info'
import { useCharacters } from '@/hooks/useCharacters'
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
  if (character.store?.coordinates) {
    return { lat: character.store.coordinates.latitude, lng: character.store.coordinates.longitude }
  }

  console.warn(`No coordinates for ${character.character?.name}, using default`)
  return { lat: 35.6812, lng: 139.7671 }
}

/**
 * 店舗位置マップページ
 */
const RouteComponent = () => {
  const { id: initialCharacterId } = Route.useSearch()
  const { data: characters } = useCharacters()
  const [selectedCharacter, setSelectedCharacter] = useState<StoreData | null>(() => {
    if (initialCharacterId) {
      const targetCharacter = characters.find((c) => c.id === initialCharacterId)
      return targetCharacter || null
    }
    return null
  })
  const [mapKey, setMapKey] = useState<number>(0)
  const [isStoreListOpen, setIsStoreListOpen] = useState(false)
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral | null>(() => {
    // 初期値として選択されたキャラクターの位置、または東京駅を設定
    if (initialCharacterId) {
      const targetCharacter = characters.find((c) => c.id === initialCharacterId)
      if (targetCharacter) {
        return getPosition(targetCharacter)
      }
    }
    return { lat: 35.6812, lng: 139.7671 }
  })
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  const charactersWithAddress = characters.filter((char) => char.store?.address && char.store.address.length > 0)

  const handleMarkerClick = (character: StoreData) => {
    setSelectedCharacter(character)
    setMapCenter(getPosition(character))
  }

  const handleCharacterSelect = (character: StoreData) => {
    setSelectedCharacter(character)
    setMapCenter(getPosition(character))
    setMapKey((prev) => prev + 1)
    setIsStoreListOpen(false)
  }

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
      <div className='relative w-full h-[calc(100dvh-3rem)] md:h-[calc(100dvh-3.5rem)] overflow-hidden'>
        <GoogleMap
          key={mapKey}
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
          {charactersWithAddress.map((character) => {
            const position = getPosition(character)
            return (
              <AdvancedMarker key={character.id} position={position} onClick={() => handleMarkerClick(character)}>
                <Pin background='#e50012' borderColor='#fff' glyphColor='#fff' />
              </AdvancedMarker>
            )
          })}
        </GoogleMap>

        {selectedCharacter && (
          <div className='absolute top-4 right-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg p-3 max-w-md z-10'>
            <SelectedStoreInfo character={selectedCharacter} />
          </div>
        )}

        <StoreList
          characters={charactersWithAddress}
          isOpen={isStoreListOpen}
          onOpenChange={setIsStoreListOpen}
          onCharacterSelect={handleCharacterSelect}
          mapCenter={mapCenter}
        />
      </div>
    </APIProvider>
  )
}

export const Route = createFileRoute('/location/')({
  component: RouteComponent,
  validateSearch: SearchParamsSchema
})
