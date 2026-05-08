import { Link } from '@tanstack/react-router'
import type dayjs from 'dayjs'
import { Cake, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useMediaQuery } from '@/hooks/use-media-query'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { DATE_LABELS } from '@/locales/app.content'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type UpcomingEvent = {
  character: StoreData
  type: 'character' | 'store'
  date: dayjs.Dayjs
  daysUntil: number
}

type UpcomingEventListItemProps = {
  event: UpcomingEvent
  index: number
}

const TAPES: ({ side: 'left' | 'right'; color: string; angle: string } | null)[] = [
  { side: 'left', color: 'bg-yellow-200/80', angle: '-rotate-[12deg]' },
  { side: 'right', color: 'bg-pink-200/80', angle: 'rotate-[10deg]' },
  { side: 'left', color: 'bg-blue-200/80', angle: '-rotate-[8deg]' },
  null,
  { side: 'right', color: 'bg-green-200/80', angle: 'rotate-[8deg]' },
  null
]

/**
 * 日数に応じたラベルを返す
 */
const getDaysLabel = (days: number) => {
  if (days === 0) return DATE_LABELS.today
  if (days === 1) return DATE_LABELS.tomorrow
  return `${days}日後`
}

/**
 * 直近のイベントリストアイテム
 */
export const UpcomingEventListItem = ({ event, index }: UpcomingEventListItemProps) => {
  const isMultiColumn = useMediaQuery('(min-width: 768px)')
  const rotationDeg = isMultiColumn ? getStickerRotation(index) : 0
  const tape = TAPES[index % TAPES.length]

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DURATION.normal, delay: index * 0.1, ease: 'easeOut' }}
      style={{ filter: STICKER_SHADOW_SM }}
    >
      <motion.div
        style={{ rotate: rotationDeg }}
        whileHover={{ scale: 1.04, rotate: 0 }}
        whileTap={{ scale: 0.97 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <Link
          to='/characters/$id'
          params={{ id: event.character.id }}
          className='relative flex items-center gap-3 bg-card rounded-xl p-3 border border-zinc-200 dark:border-card-border'
        >
          {tape && (
            <div
              aria-hidden
              className={cn(
                'absolute -top-1.5 w-8 h-3 rounded-sm',
                tape.color,
                tape.angle,
                tape.side === 'left' ? 'left-4' : 'right-4'
              )}
            />
          )}

          <div
            className={`p-2 rounded-lg ${event.type === 'character' ? 'bg-category-other text-category-other-foreground' : 'bg-category-regular-card text-category-regular-card-foreground'}`}
          >
            {event.type === 'character' ? <Cake className='h-4 w-4' /> : <Store className='h-4 w-4' />}
          </div>

          {event.character.character?.image_url && (
            <Avatar className='size-12 border border-card-border'>
              <AvatarImage
                src={event.character.character.image_url}
                alt={event.character.character?.name || ''}
                className='object-cover object-top scale-150 translate-y-2'
              />
              <AvatarFallback>{event.character.character?.name?.charAt(0) || '?'}</AvatarFallback>
            </Avatar>
          )}

          <div className='flex-1 min-w-0'>
            <p className='text-base font-semibold text-foreground truncate'>
              {getDisplayName(event.character.character?.name || '')}
            </p>
            <p className='text-xs text-muted-foreground'>{event.date.format('M月D日')}</p>
          </div>

          <div
            className={`text-xs font-bold px-2 py-1 rounded ${
              event.daysUntil === 0
                ? 'bg-brand text-brand-foreground'
                : event.daysUntil <= 7
                  ? 'bg-status-interested text-status-interested-foreground'
                  : 'bg-status-ended text-status-ended-foreground'
            }`}
          >
            {getDaysLabel(event.daysUntil)}
          </div>
        </Link>
      </motion.div>
    </motion.div>
  )
}
