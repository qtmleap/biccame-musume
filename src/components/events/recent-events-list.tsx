import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Store } from 'lucide-react'
import { motion } from 'motion/react'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type RecentEventsListProps = {
  events: Event[]
  currentEventId?: string
}

/**
 * カテゴリラベル
 */
const CATEGORY_LABELS: Record<Event['category'], string> = {
  ackey: 'アクキー',
  limited_card: '限定名刺',
  regular_card: '通年名刺',
  other: 'その他'
}

/**
 * カテゴリバッジ色
 */
const CATEGORY_COLORS: Record<Event['category'], string> = {
  ackey: 'bg-amber-100 text-amber-800',
  limited_card: 'bg-purple-100 text-purple-800',
  regular_card: 'bg-blue-100 text-blue-800',
  other: 'bg-pink-100 text-pink-800'
}

/**
 * 最近更新されたイベントリスト
 */
export const RecentEventsList = ({ events, currentEventId }: RecentEventsListProps) => {
  // 最近更新された10件を取得（現在のイベントを除く）
  const recentEvents = events
    .filter((event) => event.uuid !== currentEventId)
    .sort((a, b) => dayjs(b.updatedAt).diff(dayjs(a.updatedAt)))
    .slice(0, 10)

  if (recentEvents.length === 0) {
    return null
  }

  return (
    <div key={currentEventId} className='bg-pink-50 rounded-lg'>
      <h2 className='text-lg font-bold text-gray-900 mb-4'>最近更新されたイベント</h2>
      <div className='flex flex-col divide-y divide-gray-200'>
        {recentEvents.map((event, index) => {
          // 店舗名を取得（最大2つまで表示、それ以上は「他」と表示）
          const storeNames = event.stores.slice(0, 2).map((key) => STORE_NAME_LABELS[key as StoreKey] || key)
          const hasMore = event.stores.length > 2
          const storeDisplay = hasMore ? `${storeNames.join('、')} 他` : storeNames.join('、')

          return (
            <motion.div
              key={event.uuid}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className='flex items-start gap-3 py-3 first:pt-0'
            >
              <div className='shrink-0'>
                <div
                  className={`h-14 w-14 rounded-full flex items-center justify-center text-xs font-bold ${CATEGORY_COLORS[event.category]}`}
                >
                  {CATEGORY_LABELS[event.category]}
                </div>
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-1'>
                  <Link
                    to='/events/$uuid'
                    params={{ uuid: event.uuid }}
                    className='font-bold text-base text-gray-900 hover:underline line-clamp-2'
                  >
                    {event.name}
                  </Link>
                </div>
                <div className='flex items-center gap-1'>
                  <Store className='h-4 w-4 text-gray-400' />
                  <span className='text-sm text-gray-600 truncate'>{storeDisplay}</span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
