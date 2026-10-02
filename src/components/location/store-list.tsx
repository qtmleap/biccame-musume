import { List, X } from 'lucide-react'
import { useMemo } from 'react'
import { StoreListItem } from '@/components/store-list-item'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { StoreData } from '@/schemas/store.dto'
import { calculateDistance } from '@/utils/distance'
import { getStorePosition } from '@/utils/store-position'

type StoreListProps = {
  characters: StoreData[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCharacterSelect: (character: StoreData) => void
  mapCenter: google.maps.LatLngLiteral | null
  onPanelChange?: (element: HTMLElement | null) => void
}

/** 地図を操作できる一覧パネル。未登録店舗も一覧に残す。 */
export const StoreList = ({
  characters,
  isOpen,
  onOpenChange,
  onCharacterSelect,
  mapCenter,
  onPanelChange
}: StoreListProps) => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const rows = useMemo(
    () =>
      characters
        .map((character) => {
          const position = getStorePosition(character)
          return {
            character,
            distance:
              mapCenter && position
                ? calculateDistance(mapCenter.lat, mapCenter.lng, position.lat, position.lng)
                : undefined
          }
        })
        .sort((a, b) => {
          if (a.distance === undefined) return b.distance === undefined ? 0 : 1
          if (b.distance === undefined) return -1
          return a.distance - b.distance
        }),
    [characters, mapCenter]
  )
  const content = (
    <div className='overflow-y-auto min-h-0 p-2'>
      {rows.map(({ character, distance }) => (
        <button
          key={character.id}
          type='button'
          onClick={() => onCharacterSelect(character)}
          className='block w-full text-left rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary'
        >
          <StoreListItem character={character} distance={distance} />
        </button>
      ))}
    </div>
  )
  const trigger = (
    <button
      type='button'
      aria-expanded={isOpen}
      className='absolute bottom-4 left-4 z-10 flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-foreground shadow-lg'
      onClick={isDesktop ? () => onOpenChange(!isOpen) : undefined}
    >
      <List aria-hidden='true' className='size-4' />
      店舗一覧
    </button>
  )
  if (isDesktop)
    return (
      <>
        {trigger}
        {isOpen && (
          <section
            ref={onPanelChange}
            aria-label='店舗一覧'
            className='absolute top-24 bottom-20 left-4 z-10 flex w-72 flex-col rounded-lg border bg-card text-foreground shadow-lg'
          >
            <div className='flex items-center justify-between px-3 py-2 border-b'>
              <h2 className='text-sm font-semibold'>店舗一覧{mapCenter && '（近い順）'}</h2>
              <button
                type='button'
                aria-label='店舗一覧を閉じる'
                className='flex size-11 items-center justify-center'
                onClick={() => onOpenChange(false)}
              >
                <X aria-hidden='true' className='size-4' />
              </button>
            </div>
            {content}
          </section>
        )}
      </>
    )
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        ref={onPanelChange}
        side='bottom'
        showCloseButton={false}
        aria-describedby={undefined}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className='max-h-[38dvh] gap-0 bg-card text-foreground'
      >
        <div className='flex items-center justify-between px-4 py-2 border-b'>
          <SheetTitle className='text-sm'>店舗一覧{mapCenter && '（近い順）'}</SheetTitle>
          <button
            type='button'
            aria-label='店舗一覧を閉じる'
            className='flex size-11 items-center justify-center'
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden='true' className='size-4' />
          </button>
        </div>
        {content}
      </SheetContent>
    </Sheet>
  )
}
