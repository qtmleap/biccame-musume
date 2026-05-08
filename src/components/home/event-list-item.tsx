import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Package, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { useMediaQuery } from '@/hooks/use-media-query'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { DATE_LABELS, EVENT_LIST_ITEM_LABELS, EVENT_STATUS_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { CATEGORY_WITH_ICON } from '@/locales/component'
import type { Event, EventStatus } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type EventListItemProps = {
  event: Event
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
const getDaysLabel = (days: number, status: EventStatus) => {
  if (status === 'ended') return EVENT_STATUS_LABELS.ended
  if (status === 'last_day') return EVENT_STATUS_LABELS.last_day
  if (status === 'ongoing') return EVENT_STATUS_LABELS.ongoing
  if (status === 'upcoming') {
    if (days <= 0) return EVENT_LIST_ITEM_LABELS.today
    if (days === 1) return DATE_LABELS.tomorrow
    return `${days}日後`
  }
  return ''
}

/**
 * イベント一覧の各アイテム
 */
export const EventListItem = ({ event, index }: EventListItemProps) => {
  const isMultiColumn = useMediaQuery('(min-width: 768px)')
  const rotationDeg = isMultiColumn ? getStickerRotation(index) : 0
  const tape = TAPES[index % TAPES.length]

  const startDate = dayjs(event.startDate)
  const status = event.status
  const daysUntil = event.daysUntil

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DURATION.normal, delay: index * 0.1, ease: 'easeOut' }}
      className='h-full'
      style={{ filter: STICKER_SHADOW_SM }}
    >
      <motion.div
        className='h-full'
        style={{ rotate: rotationDeg }}
        whileHover={{ scale: 1.04, rotate: 0 }}
        whileTap={{ scale: 0.97 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <Link
          to='/events/$uuid'
          params={{ uuid: event.uuid }}
          className={cn(
            'relative flex flex-col gap-3 bg-card rounded-xl p-3 border border-zinc-200 dark:border-card-border h-full',
            status === 'ended' && 'opacity-60'
          )}
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
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2 flex-1 min-w-0'>
              <div className={`shrink-0 p-2 rounded-lg ${CATEGORY_WITH_ICON[event.category ?? 'other'].className}`}>
                {CATEGORY_WITH_ICON[event.category ?? 'other'].icon}
              </div>
              <p className='text-base font-semibold text-foreground truncate'>{event.title}</p>
            </div>
            <div
              className={`shrink-0 text-xs font-bold px-2 py-1 rounded whitespace-nowrap ${
                status === 'ended'
                  ? 'bg-status-ended text-status-ended-foreground'
                  : status === 'last_day'
                    ? 'bg-status-last-day text-status-last-day-foreground'
                    : status === 'ongoing'
                      ? 'bg-brand text-brand-foreground'
                      : daysUntil === 0
                        ? 'bg-brand text-brand-foreground'
                        : daysUntil <= 7
                          ? 'bg-status-interested text-status-interested-foreground'
                          : 'bg-status-ended text-status-ended-foreground'
              }`}
            >
              {getDaysLabel(daysUntil, status)}
            </div>
          </div>
          <div className='flex-1 min-w-0'>
            <div className='flex flex-col gap-1 text-xs text-muted-foreground'>
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
          </div>
        </Link>
      </motion.div>
    </motion.div>
  )
}
