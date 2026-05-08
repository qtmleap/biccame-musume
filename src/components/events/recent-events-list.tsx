import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Fragment } from 'react'
import { DURATION } from '@/lib/motion'
import { EVENT_CATEGORY_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type RecentEventsListProps = {
  events: Event[]
  currentEventId?: string
  hideHeading?: boolean
}

/**
 * カテゴリバッジ色
 */
const CATEGORY_COLORS: Record<Event['category'], string> = {
  ackey: 'bg-category-ackey text-category-ackey-foreground',
  limited_card: 'bg-category-limited-card text-category-limited-card-foreground',
  regular_card: 'bg-category-regular-card text-category-regular-card-foreground',
  other: 'bg-category-other text-category-other-foreground'
}

/**
 * 最近更新されたイベントリスト
 */
export const RecentEventsList = ({ events, currentEventId, hideHeading = false }: RecentEventsListProps) => {
  // 最近更新された10件を取得（現在のイベントを除く）
  const recentEvents = events
    .filter((event) => event.uuid !== currentEventId)
    .sort((a, b) => dayjs(b.updatedAt).diff(dayjs(a.updatedAt)))
    .slice(0, 10)

  if (recentEvents.length === 0) {
    return null
  }

  return (
    <div key={currentEventId} className='bg-page-bg rounded-lg'>
      {!hideHeading && <h2 className='text-lg font-bold text-foreground mb-4'>最近更新されたイベント</h2>}
      <div className='flex flex-col divide-y divide-separator'>
        {recentEvents.map((event, index) => {
          // 店舗名を取得（最大2つまでリンク表示、それ以上は「他」と末尾に追加）
          const visibleStores = event.stores.slice(0, 2) as StoreKey[]
          const hasMore = event.stores.length > 2

          return (
            <motion.div
              key={event.uuid}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.normal, delay: index * 0.05 }}
              className='flex items-start gap-3 py-3 first:pt-0'
            >
              <div className='shrink-0'>
                <div
                  className={`h-14 w-14 rounded-full flex items-center justify-center text-xs font-bold border border-card-border ${CATEGORY_COLORS[event.category]}`}
                >
                  {EVENT_CATEGORY_LABELS[event.category]}
                </div>
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-1'>
                  <Link
                    to='/events/$uuid'
                    params={{ uuid: event.uuid }}
                    className='font-bold text-base text-foreground hover:underline line-clamp-2'
                  >
                    {event.title}
                  </Link>
                </div>
                <div className='flex items-center gap-1 min-w-0'>
                  <Store className='h-4 w-4 shrink-0 text-muted-foreground/50' />
                  <div className='text-sm text-muted-foreground truncate'>
                    {visibleStores.map((key, i) => (
                      <Fragment key={key}>
                        {i > 0 && '、'}
                        <Link
                          to='/characters/$id'
                          params={{ id: key }}
                          className='hover:text-foreground hover:underline underline-offset-2'
                        >
                          {STORE_NAME_LABELS[key] || key}
                        </Link>
                      </Fragment>
                    ))}
                    {hasMore && ' 他'}
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
