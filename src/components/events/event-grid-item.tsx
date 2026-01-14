import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Package, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type EventGridItemProps = {
  event: Event
  index: number
}

/**
 * カテゴリに応じたアイコンとスタイルを返す
 */
const _getCategoryColor = (category: Event['category']) => {
  switch (category) {
    case 'limited_card':
      return 'bg-purple-100 text-purple-600'
    case 'regular_card':
      return 'bg-blue-100 text-blue-600'
    case 'ackey':
      return 'bg-amber-100 text-amber-600'
    default:
      return 'bg-pink-100 text-pink-600'
  }
}

/**
 * ステータスに応じたBadgeを返す
 */
const StatusBadge = ({ event }: { event: Event }) => {
  const currentTime = dayjs()
  const endDate = event.endDate ? dayjs(event.endDate) : null
  const status = (() => {
    if (event.endedAt != null) return 'ended'
    if (endDate && currentTime.isAfter(endDate)) return 'ended'
    if (currentTime.isBefore(dayjs(event.startDate))) return 'upcoming'
    return 'ongoing'
  })()

  switch (status) {
    case 'upcoming':
      return (
        <Badge variant='outline' className='border-blue-600 bg-blue-50 text-blue-700 text-xs'>
          開催前
        </Badge>
      )
    case 'ongoing':
      return (
        <Badge variant='outline' className='border-green-600 bg-green-50 text-green-700 text-xs'>
          開催中
        </Badge>
      )
    case 'ended':
      return (
        <Badge variant='secondary' className='text-xs'>
          終了
        </Badge>
      )
  }
}

/**
 * イベントグリッドアイテム
 */
export const EventGridItem = ({ event, index }: EventGridItemProps) => {
  const currentTime = dayjs()
  const endDate = event.endDate ? dayjs(event.endDate) : null
  const isEnded = event.endedAt != null || (endDate && currentTime.isAfter(endDate))

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
        ease: 'easeOut'
      }}
    >
      <Link
        to='/events/$eventId'
        params={{ eventId: event.id }}
        className={`block border rounded-lg p-4 bg-white hover:border-[#e50012]/30 transition-colors h-full ${
          isEnded ? 'opacity-50 grayscale' : ''
        }`}
      >
        <div className='mb-2 flex items-start justify-between gap-3'>
          <div className='flex-1'>
            <h3 className='text-sm font-semibold text-gray-900 line-clamp-2'>{event.name}</h3>
            <div className='mt-1 flex flex-col gap-1 text-xs text-muted-foreground'>
              <span className='flex items-center gap-1'>
                <Calendar className='size-3' />
                <span>{dayjs(event.startDate).format('YYYY/MM/DD')}</span>
                {event.endDate ? (
                  <>
                    <span>〜</span>
                    <span>{dayjs(event.endDate).format('YYYY/MM/DD')}</span>
                  </>
                ) : (
                  <span>〜なくなり次第終了</span>
                )}
              </span>
              <div className='flex flex-wrap items-center gap-2'>
                {event.stores && event.stores.length > 0 && (
                  <span className='flex items-center gap-1'>
                    <Store className='size-3' />
                    {event.stores.length === 1
                      ? STORE_NAME_LABELS[event.stores[0] as StoreKey]
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
          </div>
          <StatusBadge event={event} />
        </div>

        {event.conditions.some((c) => c.type === 'purchase' || c.type === 'first_come' || c.type === 'lottery') && (
          <div className='mt-2 flex flex-wrap gap-1'>
            {event.conditions.map((condition) => {
              if (condition.type === 'everyone') return null
              return (
                <Badge key={`${event.id}-${condition.type}`} variant='secondary' className='text-xs'>
                  {condition.type === 'purchase' && `${condition.purchaseAmount?.toLocaleString()}円以上購入`}
                  {condition.type === 'first_come' && '先着'}
                  {condition.type === 'lottery' && '抽選'}
                </Badge>
              )
            })}
          </div>
        )}
      </Link>
    </motion.div>
  )
}
