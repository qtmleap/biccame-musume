import { createFileRoute } from '@tanstack/react-router'
import { AdvancedMarker, APIProvider, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps'
import { List } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { SelectedStoreInfo } from '@/components/selected-store-info'
import { StoreListItem } from '@/components/store-list-item'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useCharacters } from '@/hooks/useCharacters'
import { cn } from '@/lib/utils'
import { type Character } from '@/schemas/character.dto'

/**
 * 検索パラメータのスキーマ
 */
const SearchParamsSchema = z.object({
  id: z.string().optional()
})

/**
 * キャラクターから座標を取得する関数
 * latitude/longitudeがあればそれを使用、なければデフォルト座標を返す
 */
const getPosition = (character: Character): google.maps.LatLngLiteral => {
  if (character.latitude !== undefined && character.longitude !== undefined) {
    return { lat: character.latitude, lng: character.longitude }
  }

  // フォールバック: 東京駅
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
    // URLパラメータで指定されたキャラクターを初期選択
    if (initialCharacterId) {
      const targetCharacter = characters.find((c) => c.key === initialCharacterId)
      return targetCharacter || null
    }
    return null
  })
  const [mapKey, setMapKey] = useState<number>(0)
  const [isStoreListOpen, setIsStoreListOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  // 住所があるキャラクターのみフィルタリング
  const charactersWithAddress = characters.filter((char) => char.address && char.address.length > 0)

  // マーカークリック時の処理
  const handleMarkerClick = (character: Character) => {
    setSelectedCharacter(character)
  }

  // 店舗一覧から選択時の処理
  const handleCharacterSelect = (character: Character) => {
    setSelectedCharacter(character)
    setMapKey((prev) => prev + 1)
    setIsStoreListOpen(false) // Drawer/Dialogを閉じる
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
      <div className='relative w-full h-[calc(100vh-3rem)] md:h-[calc(100vh-3.5rem)] overflow-hidden'>
        {/* フルスクリーン地図 */}
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

        {/* 右側: 選択された店舗情報 */}
        {selectedCharacter && (
          <div className='absolute top-4 right-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg p-3 max-w-md z-10'>
            <SelectedStoreInfo character={selectedCharacter} />
          </div>
        )}

        {/* 左下: 店舗一覧 (レスポンシブ: デスクトップはDialog、モバイルはDrawer) */}
        {isDesktop ? (
          <Dialog open={isStoreListOpen} onOpenChange={setIsStoreListOpen}>
            <DialogTrigger asChild>
              <button
                type='button'
                className='absolute bottom-4 left-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg px-6 py-3 z-10 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
              >
                <div className='flex items-center gap-2'>
                  <List className='w-5 h-5' />
                  <span className='font-semibold text-gray-800 dark:text-gray-100'>
                    店舗一覧 ({charactersWithAddress.length})
                  </span>
                </div>
              </button>
            </DialogTrigger>
            <DialogContent className='max-w-3xl!'>
              <DialogHeader>
                <DialogTitle>店舗一覧</DialogTitle>
              </DialogHeader>
              <div className='overflow-y-auto max-h-[60vh] p-4 custom-scrollbar'>
                <div className='grid grid-cols-2 md:grid-cols-3 gap-3'>
                  {charactersWithAddress.map((character) => (
                    <button
                      key={character.key}
                      type='button'
                      onClick={() => handleCharacterSelect(character)}
                      className='cursor-pointer w-full text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
                    >
                      <StoreListItem character={character} />
                    </button>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Drawer open={isStoreListOpen} onOpenChange={setIsStoreListOpen}>
            <DrawerTrigger asChild>
              <button
                type='button'
                className='absolute bottom-4 left-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg px-6 py-3 z-10 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
              >
                <div className='flex items-center gap-2'>
                  <List className='w-5 h-5' />
                  <span className='font-semibold text-gray-800 dark:text-gray-100'>
                    店舗一覧 ({charactersWithAddress.length})
                  </span>
                </div>
              </button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader className='py-2 px-4'>
                <DrawerTitle className='text-sm font-medium'>店舗一覧 ({charactersWithAddress.length}件)</DrawerTitle>
              </DrawerHeader>
              <div className='overflow-y-auto max-h-[60vh] custom-scrollbar'>
                <div className='divide-y divide-gray-200 dark:divide-gray-700'>
                  {charactersWithAddress.map((character, index) => (
                    <button
                      key={character.key}
                      type='button'
                      onClick={() => handleCharacterSelect(character)}
                      className={cn(
                        'cursor-pointer w-full text-left px-4 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700',
                        index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'
                      )}
                    >
                      <StoreListItem character={character} />
                    </button>
                  ))}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        )}
      </div>
    </APIProvider>
  )
}

export const Route = createFileRoute('/location/')({
  component: RouteComponent,
  validateSearch: SearchParamsSchema
})
