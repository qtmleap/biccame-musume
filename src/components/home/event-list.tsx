import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Package, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { useEvents } from '@/hooks/useEvents'

/**
 * 日数に応じたラベルを返す
 */
const getDaysLabel = (days: number, isStarted: boolean) => {
  if (isStarted) return '開催中'
  if (days === 0) return '今日'
  if (days === 1) return '明日'
  return `${days}日後`
}

/**
 * トップページ用のイベント一覧
 * 開催中および開催一週間前のイベントを表示
 */
export const EventList = () => {
  const { data: events = [], isLoading } = useEvents()

  // 開催中および開催一週間前のイベントをフィルタリング
  const upcomingEvents = events
    .filter((event) => {
      if (!event.isActive) return false

      const now = dayjs()
      const startDate = dayjs(event.startDate)
      const endDate = event.endDate ? dayjs(event.endDate) : null

      // 開催中のイベント
      if (now.isAfter(startDate) && (!endDate || now.isBefore(endDate))) {
        return true
      }

      // 開催一週間前のイベント
      const oneWeekBefore = startDate.subtract(7, 'day')
      if (now.isAfter(oneWeekBefore) && now.isBefore(startDate)) {
        return true
      }

      return false
    })
    .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())

  if (isLoading || upcomingEvents.length === 0) {
    return null
  }

  return (
    <section className='py-6 md:py-8'>
      <div className='container mx-auto px-4'>
        <div className='max-w-2xl mx-auto'>
          <div className='flex items-center gap-2 mb-4'>
            <Calendar className='h-5 w-5 text-[#e50012]' />
            <h2 className='text-base font-bold text-gray-800'>開催中・開催予定のイベント</h2>
          </div>

          <div className='flex flex-col gap-2'>
            {upcomingEvents.map((event, index) => {
              const now = dayjs()
              const startDate = dayjs(event.startDate)
              const isStarted = now.isAfter(startDate)
              const daysUntil = startDate.diff(now, 'day')

              return (
                <motion.div
                  key={event.id}
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
                  <a
                    href={event.referenceUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:border-[#e50012]/30 transition-colors cursor-pointer'
                  >
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium text-gray-800 truncate'>{event.name}</p>
                      <div className='flex flex-wrap items-center gap-2 text-xs text-gray-500'>
                        <span className='flex items-center gap-1'>
                          <Calendar className='size-3' />
                          {startDate.format('M月D日')}
                          {event.endDate && `〜${dayjs(event.endDate).format('M月D日')}`}
                        </span>
                        {event.stores && event.stores.length > 0 && (
                          <span className='flex items-center gap-1'>
                            <Store className='size-3' />
                            {event.stores.length === 1 ? event.stores[0] : `${event.stores.length}店舗`}
                          </span>
                        )}
                        {event.limitedQuantity && (
                          <span className='flex items-center gap-1'>
                            <Package className='size-3' />
                            限定{event.limitedQuantity}個
                          </span>
                        )}
                      </div>
                      {event.conditions.some((c) => c.type === 'purchase' || c.type === 'first_come' || c.type === 'lottery') && (
                        <div className='mt-1 flex flex-wrap gap-1'>
                          {event.conditions.map((condition) => {
                            if (condition.type === 'everyone') return null
                            return (
                              <Badge key={`${event.id}-${condition.type}`} variant='secondary' className='text-xs'>
                                {condition.type === 'purchase' &&
                                  `${condition.purchaseAmount?.toLocaleString()}円以上購入`}
                                {condition.type === 'first_come' && '先着'}
                                {condition.type === 'lottery' && '抽選'}
                              </Badge>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div
                      className={`text-xs font-bold px-2 py-1 rounded whitespace-nowrap ${
                        isStarted
                          ? 'bg-[#e50012] text-white'
                          : daysUntil === 0
                            ? 'bg-[#e50012] text-white'
                            : daysUntil <= 7
                              ? 'bg-orange-100 text-orange-600'
                              : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {getDaysLabel(daysUntil, isStarted)}
                    </div>
                  </a>
                </motion.div>
              )
            })}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6, ease: 'easeOut' }}
            className='mt-4 text-right'
          >
            <Link
              to='/admin/events'
              className='text-sm text-gray-700 hover:text-gray-900 font-semibold hover:underline transition-colors'
            >
              イベント登録
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
