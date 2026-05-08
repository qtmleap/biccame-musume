import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Package, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { useMediaQuery } from '@/hooks/use-media-query'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM, STICKER_TAPES } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { EVENT_CATEGORY_LABELS, EVENT_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { CATEGORY_BADGE, STATUS_BADGE_SM } from '@/locales/component'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type EventGridItemProps = {
  event: Event
  index?: number
  /** ステータス・条件バッジを隠し、終了時の grayscale を無効化する */
  compact?: boolean
}

/**
 * 終了間近のイベントの背景色を計算する
 * 開催期間の進捗率に応じて色が変わる
 * @returns 背景色のクラス名（終了間近でない場合はundefined）
 */
const getEndingSoonBackground = (event: Event): string | undefined => {
  const currentTime = dayjs()
  const startDate = dayjs(event.startDate)
  const endDate = event.endDate ? dayjs(event.endDate) : null

  if (!endDate) return undefined
  if (event.endedAt != null) return undefined
  if (currentTime.isAfter(endDate)) return undefined
  if (currentTime.isBefore(startDate)) return undefined

  const totalDuration = endDate.diff(startDate)
  const elapsed = currentTime.diff(startDate)
  const progress = elapsed / totalDuration

  if (progress >= 0.95) return 'bg-destructive/20'
  if (progress >= 0.85) return 'bg-destructive/10'
  if (progress >= 0.7) return 'bg-warning/10'
  return undefined
}

/**
 * イベントグリッドアイテム
 */
export const EventGridItem = ({ event, index = 0, compact = false }: EventGridItemProps) => {
  const isMultiColumn = useMediaQuery('(min-width: 640px)')
  const rotationDeg = isMultiColumn ? getStickerRotation(index) : 0
  const tape = STICKER_TAPES[index % STICKER_TAPES.length]

  const isEnded = event.status === 'ended'
  const endingSoonBg = getEndingSoonBackground(event)
  const dimEnded = isEnded && !compact

  return (
    <motion.div className='h-full' style={{ filter: STICKER_SHADOW_SM }}>
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
            'relative block rounded-xl p-4 border border-zinc-200 dark:border-card-border h-full',
            dimEnded ? 'opacity-50 grayscale bg-card' : endingSoonBg || 'bg-card'
          )}
        >
          {tape && (
            <div aria-hidden className={cn('absolute rounded-sm', tape.position, tape.size, tape.color, tape.angle)} />
          )}
          <div className='mb-2 flex items-start justify-between gap-3'>
            <div className='flex-1 min-w-0'>
              <div className='mb-1.5 flex flex-wrap items-center gap-1.5'>
                {CATEGORY_BADGE[event.category](EVENT_CATEGORY_LABELS[event.category])}
              </div>
              <h3 className='text-base font-semibold text-foreground line-clamp-2'>{event.title}</h3>
              <div className='mt-1 flex flex-col gap-1 text-xs text-muted-foreground'>
                <span className='flex items-center gap-1'>
                  <Calendar className='size-3.5' />
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
                      <Store className='size-3.5' />
                      {event.stores.length === 1
                        ? STORE_NAME_LABELS[event.stores[0] as StoreKey]
                        : `${event.stores.length}店舗`}
                    </span>
                  )}
                  {event.limitedQuantity && !event.conditions.some((c) => c.type === 'everyone') && (
                    <span className='flex items-center gap-1'>
                      <Package className='size-3.5' />
                      限定{event.limitedQuantity}個
                    </span>
                  )}
                </div>
              </div>
            </div>
            {!compact && STATUS_BADGE_SM[event.status]()}
          </div>

          {!compact &&
            event.conditions.some((c) => c.type === 'purchase' || c.type === 'first_come' || c.type === 'lottery') && (
              <div className='mt-2 flex flex-wrap gap-1'>
                {event.conditions.map((condition) => {
                  if (condition.type === 'everyone') return null
                  return (
                    <Badge key={`${event.uuid}-${condition.type}`} variant='secondary'>
                      {condition.type === 'purchase' && `${condition.purchaseAmount?.toLocaleString()}円以上購入`}
                      {condition.type === 'first_come' && EVENT_LABELS.firstCome}
                      {condition.type === 'lottery' && EVENT_LABELS.lottery}
                    </Badge>
                  )
                })}
              </div>
            )}
        </Link>
      </motion.div>
    </motion.div>
  )
}
