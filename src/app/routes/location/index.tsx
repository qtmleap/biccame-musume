import { createFileRoute } from '@tanstack/react-router'
import { AdvancedMarker, APIProvider, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps'
import { useEffect, useState } from 'react'
import { z } from 'zod'
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
 * 店舗位置マップページ
 */
const RouteComponent = () => {
  const { id: initialCharacterId } = Route.useSearch()
  const { data: characters } = useCharacters()
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(() => {
    if (initialCharacterId) {
      const targetCharacter = characters.find((c) => c.key === initialCharacterId)
      return targetCharacter || null
    }
    return null
  })
  const [mapKey, setMapKey] = useState<number>(0)
  const [isStoreListOpen, setIsStoreListOpen] = useState(false)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  const charactersWithAddress = characters.filter((char) => char.address && char.address.length > 0)

  // セーフエリアの値を取得して表示
  useEffect(() => {
    const updateSafeAreaValues = () => {
      // ダミー要素を作成してセーフエリアを測定
      const testDiv = document.createElement('div')
      testDiv.style.position = 'fixed'
      testDiv.style.top = '0'
      testDiv.style.left = '0'
      testDiv.style.width = '100vw'
      testDiv.style.height = '100vh'
      testDiv.style.padding =
        'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
      testDiv.style.boxSizing = 'border-box'
      testDiv.style.pointerEvents = 'none'
      testDiv.style.visibility = 'hidden'
      document.body.appendChild(testDiv)

      const computed = getComputedStyle(testDiv)
      const paddingTop = computed.paddingTop
      const paddingBottom = computed.paddingBottom
      const paddingLeft = computed.paddingLeft
      const paddingRight = computed.paddingRight

      document.body.removeChild(testDiv)

      // CSS変数に値を設定
      document.documentElement.style.setProperty('--safe-area-inset-top', paddingTop)
      document.documentElement.style.setProperty('--safe-area-inset-bottom', paddingBottom)
      document.documentElement.style.setProperty('--safe-area-inset-left', paddingLeft)
      document.documentElement.style.setProperty('--safe-area-inset-right', paddingRight)

      // デバッグ表示を更新
      const topEl = document.getElementById('safe-top-value')
      const bottomEl = document.getElementById('safe-bottom-value')
      const leftEl = document.getElementById('safe-left-value')
      const rightEl = document.getElementById('safe-right-value')

      if (topEl) topEl.textContent = paddingTop
      if (bottomEl) bottomEl.textContent = paddingBottom
      if (leftEl) leftEl.textContent = paddingLeft
      if (rightEl) rightEl.textContent = paddingRight
    }

    updateSafeAreaValues()

    // リサイズ時や向き変更時にも再計算
    window.addEventListener('resize', updateSafeAreaValues)
    window.addEventListener('orientationchange', updateSafeAreaValues)

    return () => {
      window.removeEventListener('resize', updateSafeAreaValues)
      window.removeEventListener('orientationchange', updateSafeAreaValues)
    }
  }, [])

  const handleMarkerClick = (character: Character) => {
    console.log('Marker clicked:', character.character_name)
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

        {/* デバッグ用: セーフエリアの値を表示 */}
        <div className='absolute top-20 left-4 bg-black/80 text-white p-2 rounded text-xs z-50 font-mono'>
          <div>
            top: <span id='safe-top-value'>-</span>
          </div>
          <div>
            bottom: <span id='safe-bottom-value'>-</span>
          </div>
          <div>
            left: <span id='safe-left-value'>-</span>
          </div>
          <div>
            right: <span id='safe-right-value'>-</span>
          </div>
        </div>
      </div>
    </APIProvider>
  )
}

export const Route = createFileRoute('/location/')({
  component: RouteComponent,
  validateSearch: SearchParamsSchema
})
