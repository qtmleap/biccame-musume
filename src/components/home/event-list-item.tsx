import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Package, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { EVENT_STATUS_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { CATEGORY_WITH_ICON } from '@/locales/component.content'
import type { Event, EventStatus } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type EventListItemProps = {
  event: Event
  index: number
}

/**
 * 日数に応じたラベルを返す
 */
const getDaysLabel = (days: number, status: EventStatus) => {
  if (status === 'ended') return EVENT_STATUS_LABELS.ended
  if (status === 'last_day') return EVENT_STATUS_LABELS.last_day
  if (status === 'ongoing') return EVENT_STATUS_LABELS.ongoing
  if (status === 'upcoming') {
    if (days <= 0) return '本日開始'
    if (days === 1) return '明日'
    return `${days}日後`
  }
  return ''
}

/**
 * イベント一覧の各アイテム
 */
export const EventListItem = ({ event, index }: EventListItemProps) => {
  const startDate = dayjs(event.startDate)
  const status = event.status
  const daysUntil = event.daysUntil

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
      <Link
        to='/events/$uuid'
        params={{ uuid: event.uuid }}
        className={`flex flex-col gap-3 bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:border-[#e50012]/30 transition-colors cursor-pointer h-full ${
          status === 'ended' ? 'opacity-60' : ''
        }`}
      >
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2 flex-1 min-w-0'>
            <div className={`shrink-0 p-2 rounded-lg ${CATEGORY_WITH_ICON[event.category ?? 'other'].className}`}>
              {CATEGORY_WITH_ICON[event.category ?? 'other'].icon}
            </div>
            <p className='text-sm font-medium text-gray-800 line-clamp-2'>{event.title}</p>
          </div>
          <div
            className={`shrink-0 text-xs font-bold px-2 py-1 rounded whitespace-nowrap ${
              status === 'ended'
                ? 'bg-gray-400 text-white'
                : status === 'last_day'
                  ? 'bg-orange-500 text-white'
                  : status === 'ongoing'
                    ? 'bg-[#e50012] text-white'
                    : daysUntil === 0
                      ? 'bg-[#e50012] text-white'
                      : daysUntil <= 7
                        ? 'bg-orange-100 text-orange-600'
                        : 'bg-gray-100 text-gray-600'
            }`}
          >
            {getDaysLabel(daysUntil, status)}
          </div>
        </div>
        <div className='flex-1 min-w-0'>
          <div className='flex flex-col gap-1 text-xs text-gray-500'>
            <span className='flex items-center gap-1'>
              <Calendar className='size-3' />
              {startDate.format('M月D日')}
              {event.endDate ? `〜${dayjs(event.endDate).format('M月D日')}` : '〜なくなり次第終了'}
            </span>
            <div className='flex flex-wrap items-center gap-2'>
              {event.stores && event.stores.length > 0 && (
                <span className='flex items-center gap-1'>
                  <Store className='size-3' />
                  {event.stores.length === 1
                    ? STORE_NAME_LABELS[event.stores[0] as StoreKey] || event.stores[0]
                    : `${event.stores.length}店舗`}
                </span>
              )}
              {event.limitedQuantity && !event.conditions.some((c) => c.type === 'everyone') && (
                <span className='flex items-center gap-1'>
                  <Package className='size-3' />
                  限定{event.limitedQuantity}個
                </span>
              )}
            </div>
          </div>
          {event.conditions.some((c) => c.type === 'purchase' || c.type === 'first_come' || c.type === 'lottery') && (
            <div className='mt-1 flex flex-wrap gap-1'>
              {event.conditions.map((condition) => {
                if (condition.type === 'everyone') return null
                return (
                  <Badge key={`${event.uuid}-${condition.type}`} variant='secondary' className='text-xs'>
                    {condition.type === 'purchase' && `${condition.purchaseAmount?.toLocaleString()}円以上購入`}
                    {condition.type === 'first_come' && '先着'}
                    {condition.type === 'lottery' && '抽選'}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
