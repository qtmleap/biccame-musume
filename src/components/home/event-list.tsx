import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { orderBy } from 'lodash-es'
import { Calendar } from 'lucide-react'
import { motion } from 'motion/react'
import { EventListItem } from '@/components/home/event-list-item'
import { useEvents } from '@/hooks/useEvents'

/**
 * トップページ用のイベント一覧
 * 開催中および開催一週間前のイベントを表示
 */
export const EventList = () => {
  const { data: events = [], isLoading } = useEvents()

  // 開催中および開催一週間前のイベントをフィルタリングし、開始日時・カテゴリ・店舗順でソート
  const upcomingEvents = orderBy(
    events.filter((event) => {
      // 終了したイベントは非表示
      if (event.status === 'ended') {
        return false
      }

      const currentTime = dayjs()
      const startDate = dayjs(event.startDate)

      // 開催中のイベント（最終日も含む）
      if (event.status === 'ongoing' || event.status === 'last_day') {
        return true
      }

      // 開催一週間前のイベント
      const oneWeekBefore = startDate.subtract(7, 'day')
      if (currentTime.isAfter(oneWeekBefore) && currentTime.isBefore(startDate)) {
        return true
      }

      return false
    }),
    [(e) => dayjs(e.startDate).valueOf(), (e) => e.category, (e) => e.stores?.[0] || ''],
    ['asc', 'asc', 'asc']
  )

  if (isLoading || upcomingEvents.length === 0) {
    return null
  }

  return (
    <section>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='flex items-center gap-2 mb-4'>
          <Calendar className='h-5 w-5 text-[#e50012]' />
          <h2 className='text-base font-bold text-gray-800'>開催中・開催予定のイベント</h2>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
          {upcomingEvents.map((event, index) => (
            <EventListItem key={event.id} event={event} index={index} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6, ease: 'easeOut' }}
          className='mt-4 text-right'
        >
          <Link
            to='/events'
            className='text-sm text-gray-700 hover:text-gray-900 font-semibold hover:underline transition-colors'
          >
            イベント一覧
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
