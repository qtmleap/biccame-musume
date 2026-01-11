import { List } from 'lucide-react'
import { useMemo } from 'react'
import { StoreListItem } from '@/components/store-list-item'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import type { StoreData } from '@/schemas/store.dto'
import { calculateDistance } from '@/utils/distance'

type StoreListDialogProps = {
  characters: StoreData[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCharacterSelect: (character: StoreData) => void
  mapCenter: google.maps.LatLngLiteral | null
}

/**
 * 店舗一覧ダイアログ（デスクトップ）
 */
const StoreListDesktopDialog = ({
  characters,
  isOpen,
  onOpenChange,
  onCharacterSelect,
  mapCenter
}: StoreListDialogProps) => {
  // 地図の中心位置からの距離順にソート（距離も計算）
  const sortedCharactersWithDistance = useMemo(() => {
    if (!mapCenter) return characters.map((c) => ({ character: c, distance: undefined }))

    return [...characters]
      .map((character) => {
        const coords = character.store?.coordinates
        if (!coords) return { character, distance: undefined }

        const distance = calculateDistance(mapCenter.lat, mapCenter.lng, coords.latitude, coords.longitude)
        return { character, distance }
      })
      .sort((a, b) => {
        if (a.distance === undefined) return 1
        if (b.distance === undefined) return -1
        return a.distance - b.distance
      })
  }, [characters, mapCenter])

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type='button'
          className='absolute bottom-4 left-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg px-4 py-2 z-10 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
        >
          <div className='flex items-center gap-2'>
            <List className='w-4 h-4' />
            <span className='font-medium text-sm text-gray-800 dark:text-gray-100'>店舗一覧</span>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className='max-w-3xl!' aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>店舗一覧{mapCenter && '（近い順）'}</DialogTitle>
        </DialogHeader>
        <div className='overflow-y-auto max-h-[60vh] p-4 custom-scrollbar'>
          <div className='grid grid-cols-2 md:grid-cols-3 gap-3'>
            {sortedCharactersWithDistance.map(({ character, distance }) => (
              <button
                key={character.id}
                type='button'
                onClick={() => onCharacterSelect(character)}
                className='cursor-pointer w-full text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
              >
                <StoreListItem character={character} distance={distance} />
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 店舗一覧ドロワー（モバイル）
 */
const StoreListMobileDrawer = ({
  characters,
  isOpen,
  onOpenChange,
  onCharacterSelect,
  mapCenter
}: StoreListDialogProps) => {
  // 地図の中心位置からの距離順にソート（距離も計算）
  const sortedCharactersWithDistance = useMemo(() => {
    if (!mapCenter) return characters.map((c) => ({ character: c, distance: undefined }))

    return [...characters]
      .map((character) => {
        const coords = character.store?.coordinates
        if (!coords) return { character, distance: undefined }

        const distance = calculateDistance(mapCenter.lat, mapCenter.lng, coords.latitude, coords.longitude)
        return { character, distance }
      })
      .sort((a, b) => {
        if (a.distance === undefined) return 1
        if (b.distance === undefined) return -1
        return a.distance - b.distance
      })
  }, [characters, mapCenter])

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <button
          type='button'
          className='absolute bottom-4 left-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg px-4 py-2 z-10 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
        >
          <div className='flex items-center gap-2'>
            <List className='w-4 h-4' />
            <span className='font-medium text-sm text-gray-800 dark:text-gray-100'>店舗一覧</span>
          </div>
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className='py-2 px-4'>
          <DrawerTitle className='text-sm font-medium'>店舗一覧{mapCenter && '（近い順）'}</DrawerTitle>
        </DrawerHeader>
        <div className='overflow-y-auto max-h-[60vh] custom-scrollbar'>
          <div className='divide-y divide-gray-200 dark:divide-gray-700'>
            {sortedCharactersWithDistance.map(({ character, distance }, index) => (
              <button
                key={character.id}
                type='button'
                onClick={() => onCharacterSelect(character)}
                className={cn(
                  'cursor-pointer w-full text-left px-4 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700',
                  index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'
                )}
              >
                <StoreListItem character={character} distance={distance} />
              </button>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/**
 * 店舗一覧コンポーネント（レスポンシブ）
 */
export const StoreList = ({ characters, isOpen, onOpenChange, onCharacterSelect, mapCenter }: StoreListDialogProps) => {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  return isDesktop ? (
    <StoreListDesktopDialog
      characters={characters}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onCharacterSelect={onCharacterSelect}
      mapCenter={mapCenter}
    />
  ) : (
    <StoreListMobileDrawer
      characters={characters}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onCharacterSelect={onCharacterSelect}
      mapCenter={mapCenter}
    />
  )
}
