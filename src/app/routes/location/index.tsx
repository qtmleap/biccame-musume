import { createFileRoute } from '@tanstack/react-router'
import { AdvancedMarker, APIProvider, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps'
import { Suspense, useEffect, useState } from 'react'
import { z } from 'zod'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { StoreList } from '@/components/location/store-list'
import { SelectedStoreInfo } from '@/components/selected-store-info'
import { useCharacters } from '@/hooks/useCharacters'
import type { Character } from '@/schemas/character.dto'

/**
 * 検索パラメータのスキーマ
 */
const SearchParamsSchema = z.object({
  id: z.string().optional()
})

/**
 * キャラクターから座標を取得する関数
 */
const getPosition = (character: Character): google.maps.LatLngLiteral => {
  if (character.latitude !== undefined && character.longitude !== undefined) {
    return { lat: character.latitude, lng: character.longitude }
  }

  console.warn(`No coordinates for ${character.character_name}, using default`)
  return { lat: 35.6812, lng: 139.7671 }
}

/**
 * 店舗位置マップコンテンツ
 */
const LocationContent = ({ initialCharacterId }: { initialCharacterId?: string }) => {
  const { data: characters } = useCharacters()
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [mapKey, setMapKey] = useState<number>(0)
  const [isStoreListOpen, setIsStoreListOpen] = useState(false)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  // 初期キャラクターの設定
  useEffect(() => {
    if (initialCharacterId && !selectedCharacter) {
      const targetCharacter = characters.find((c) => c.key === initialCharacterId)
      if (targetCharacter) {
        setSelectedCharacter(targetCharacter)
      }
    }
  }, [initialCharacterId, characters, selectedCharacter])

  const charactersWithAddress = characters.filter((char) => char.address && char.address.length > 0)

  const handleMarkerClick = (character: Character) => {
    setSelectedCharacter(character)
  }

  const handleCharacterSelect = (character: Character) => {
    setSelectedCharacter(character)
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
          defaultZoom={selectedCharacter ? 15 : 5}
          mapId='biccamera-stores-map'
          gestureHandling='greedy'
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          minZoom={5}
          maxZoom={18}
        >
          {charactersWithAddress.map((character) => {
            const position = getPosition(character)
            return (
              <AdvancedMarker key={character.key} position={position} onClick={() => handleMarkerClick(character)}>
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
        />
      </div>
    </APIProvider>
  )
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => {
  const { id } = Route.useSearch()
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LocationContent initialCharacterId={id} />
    </Suspense>
  )
}

export const Route = createFileRoute('/location/')({
  component: RouteComponent,
  validateSearch: SearchParamsSchema
})
