import { Link } from '@tanstack/react-router'
import type dayjs from 'dayjs'
import { Cake, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DURATION } from '@/lib/motion'
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
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: DURATION.normal,
        delay: index * 0.1,
        ease: 'easeOut'
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Link to='/characters/$id' params={{ id: event.character.id }}>
        <div className='flex items-center gap-3 bg-card rounded-lg p-3 shadow-sm border-card transition-colors cursor-pointer'>
          <div
            className={`p-2 rounded-lg ${event.type === 'character' ? 'bg-category-other text-category-other-foreground' : 'bg-category-regular-card text-category-regular-card-foreground'}`}
          >
            {event.type === 'character' ? <Cake className='h-4 w-4' /> : <Store className='h-4 w-4' />}
          </div>

          {event.character.character?.image_url && (
            <Avatar className='w-8 h-8 border border-card-border'>
              <AvatarImage
                src={event.character.character.image_url}
                alt={event.character.character?.name || ''}
                className='object-cover object-top scale-150 translate-y-2'
              />
              <AvatarFallback>{event.character.character?.name?.charAt(0) || '?'}</AvatarFallback>
            </Avatar>
          )}

          <div className='flex-1 min-w-0'>
            <p className='text-sm font-medium text-foreground truncate'>
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
        </div>
      </Link>
    </motion.div>
  )
}
