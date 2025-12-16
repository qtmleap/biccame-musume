import { createFileRoute } from '@tanstack/react-router'
import { AdvancedMarker, APIProvider, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps'
import { List } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CharacterListCard } from '@/components/character-list-card'
import { StoreListItem } from '@/components/store-list-item'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { type Character, CharactersSchema } from '@/schemas/character.dto'

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
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mapKey, setMapKey] = useState<number>(0)
  const [isStoreListOpen, setIsStoreListOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        const response = await fetch('/characters.json')
        if (!response.ok) {
          throw new Error('Failed to fetch characters')
        }
        const data = await response.json()
        const result = CharactersSchema.safeParse(data)

        if (!result.success) {
          console.error('Validation error:', result.error)
          throw new Error('Invalid characters data format')
        }

        setCharacters(result.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchCharacters()
  }, [])

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

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4'></div>
          <p className='text-muted-foreground'>読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <p className='text-destructive mb-2'>エラーが発生しました</p>
          <p className='text-sm text-muted-foreground'>{error}</p>
        </div>
      </div>
    )
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
      <div className='relative w-full h-screen overflow-hidden'>
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
          <div className='absolute top-4 right-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg p-4 max-w-sm max-h-[calc(100vh-2rem)] overflow-y-auto z-10'>
            <div className='flex items-start justify-between mb-3'>
              <h2 className='text-lg font-semibold text-gray-800 dark:text-gray-100'>選択中の店舗</h2>
              <button
                type='button'
                onClick={() => setSelectedCharacter(null)}
                className='text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none'
              >
                ✕
              </button>
            </div>
            <CharacterListCard character={selectedCharacter} />
            <div className='mt-4 space-y-2 text-sm'>
              {selectedCharacter.address && (
                <div>
                  <span className='font-semibold text-gray-700 dark:text-gray-300'>住所:</span>
                  <p className='text-gray-600 dark:text-gray-400 mt-1'>{selectedCharacter.address}</p>
                </div>
              )}
              {selectedCharacter.zipcode && (
                <div>
                  <span className='font-semibold text-gray-700 dark:text-gray-300'>郵便番号:</span>
                  <p className='text-gray-600 dark:text-gray-400 mt-1'>〒{selectedCharacter.zipcode}</p>
                </div>
              )}
              {selectedCharacter.store_link && (
                <div>
                  <a
                    href={selectedCharacter.store_link}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline'
                  >
                    店舗詳細を見る
                  </a>
                </div>
              )}
            </div>
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
            <DialogContent className='max-w-4xl! max-h-[80vh]'>
              <DialogHeader>
                <DialogTitle>店舗一覧</DialogTitle>
              </DialogHeader>
              <div className='overflow-y-auto max-h-[60vh] p-4'>
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
              <DrawerHeader>
                <DrawerTitle>店舗一覧</DrawerTitle>
              </DrawerHeader>
              <div className='overflow-y-auto max-h-[60vh] p-4'>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
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
            </DrawerContent>
          </Drawer>
        )}
      </div>
    </APIProvider>
  )
}

export const Route = createFileRoute('/location/')({
  component: RouteComponent
})
