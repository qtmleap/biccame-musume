import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Package, Store } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { EVENT_CATEGORY_LABELS, EVENT_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { CATEGORY_BADGE, STATUS_BADGE_SM } from '@/locales/component'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type EventGridItemProps = {
  event: Event
}

/**
 * カテゴリに応じたアイコンとスタイルを返す
 */
// @ts-expect-error 将来の使用のために残している
const _getCategoryColor = (category: Event['category']) => {
  switch (category) {
    case 'limited_card':
      return 'bg-category-limited-card text-category-limited-card-foreground'
    case 'regular_card':
      return 'bg-category-regular-card text-category-regular-card-foreground'
    case 'ackey':
      return 'bg-category-ackey text-category-ackey-foreground'
    default:
      return 'bg-category-other text-category-other-foreground'
  }
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

  // 終了日がない、または既に終了している場合は対象外
  if (!endDate) return undefined
  if (event.endedAt != null) return undefined
  if (currentTime.isAfter(endDate)) return undefined
  if (currentTime.isBefore(startDate)) return undefined

  // 開催期間の進捗率を計算（0〜1）
  const totalDuration = endDate.diff(startDate)
  const elapsed = currentTime.diff(startDate)
  const progress = elapsed / totalDuration

  // 進捗率に応じた背景色
  if (progress >= 0.95) return 'bg-destructive/20'
  if (progress >= 0.85) return 'bg-destructive/10'
  if (progress >= 0.7) return 'bg-warning/10'
  return undefined
}

/**
 * イベントグリッドアイテム
 */
export const EventGridItem = ({ event }: EventGridItemProps) => {
  const isEnded = event.status === 'ended'
  const endingSoonBg = getEndingSoonBackground(event)

  return (
    <div>
      <Link
        to='/events/$uuid'
        params={{ uuid: event.uuid }}
        className={cn(
          'block border-card rounded-lg p-4 hover:border-brand/40 transition-colors h-full',
          isEnded ? 'opacity-50 grayscale bg-card' : endingSoonBg || 'bg-card'
        )}
      >
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
          {STATUS_BADGE_SM[event.status]()}
        </div>

        {event.conditions.some((c) => c.type === 'purchase' || c.type === 'first_come' || c.type === 'lottery') && (
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
    </div>
  )
}
