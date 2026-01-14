import { Link } from '@tanstack/react-router'
import type dayjs from 'dayjs'
import { Cake, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  if (days === 0) return '今日'
  if (days === 1) return '明日'
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
        duration: 0.4,
        delay: index * 0.1,
        ease: 'easeOut'
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Link to='/characters/$id' params={{ id: event.character.id }}>
        <div className='flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:border-[#e50012]/30 transition-colors cursor-pointer'>
          <div
            className={`p-2 rounded-lg ${event.type === 'character' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}
          >
            {event.type === 'character' ? <Cake className='h-4 w-4' /> : <Store className='h-4 w-4' />}
          </div>

          {event.character.character?.image_url && (
            <Avatar className='w-8 h-8 overflow-hidden'>
              <AvatarImage
                src={event.character.character.image_url}
                alt={event.character.character?.name || ''}
                className='object-cover object-top scale-150 translate-y-2'
              />
              <AvatarFallback>{event.character.character?.name?.charAt(0) || '?'}</AvatarFallback>
            </Avatar>
          )}

          <div className='flex-1 min-w-0'>
            <p className='text-sm font-medium text-gray-800 truncate'>
              {getDisplayName(event.character.character?.name || '')}
            </p>
            <p className='text-xs text-gray-500'>{event.date.format('M月D日')}</p>
          </div>

          <div
            className={`text-xs font-bold px-2 py-1 rounded ${
              event.daysUntil === 0
                ? 'bg-[#e50012] text-white'
                : event.daysUntil <= 7
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {getDaysLabel(event.daysUntil)}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
