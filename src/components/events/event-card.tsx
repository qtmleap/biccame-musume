import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Badge } from '@/components/ui/badge'
import { EVENT_CATEGORY_LABELS } from '@/locales/app.content'
import { CATEGORY_STYLE } from '@/locales/component'
import type { Event } from '@/schemas/event.dto'

/**
 * イベントカードアイテム
 */
export const EventCard = ({ event }: { event: Event }) => {
  const categoryStyle = CATEGORY_STYLE[event.category]
  const formatDate = (date: Date) => dayjs(date).format('M/D')
  const dateText = event.endDate
    ? `${formatDate(event.startDate)} - ${formatDate(event.endDate)}`
    : formatDate(event.startDate)

  return (
    <Link
      to='/events/$uuid'
      params={{ uuid: event.uuid }}
      className='block rounded-lg p-2 transition-all hover:scale-[1.02] group border border-gray-200 hover:border-pink-300'
    >
      <h3 className='text-xs font-medium text-gray-900 group-hover:text-pink-600 line-clamp-2 mb-1.5 min-h-8'>
        {event.title}
      </h3>
      <div className='flex items-center justify-between gap-1'>
        <Badge className={`${categoryStyle} border text-[10px] px-1.5 py-0`}>
          {EVENT_CATEGORY_LABELS[event.category]}
        </Badge>
        <span className='text-[10px] text-gray-500'>{dateText}</span>
      </div>
    </Link>
  )
}
