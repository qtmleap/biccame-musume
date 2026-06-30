import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { orderBy } from 'lodash-es'
import { Calendar } from 'lucide-react'
import { motion } from 'motion/react'
import { EventListItem } from '@/components/home/event-list-item'
import { Skeleton } from '@/components/ui/skeleton'
import { useEvents } from '@/hooks/use-events'
import { useUserActivity } from '@/hooks/use-user-activity'
import { DURATION } from '@/lib/motion'

/**
 * 通常名刺（regular_card）の重複を排除し、店舗ごとに最新のものだけを残す
 * @param events フィルタリング済みのイベント一覧
 * @returns 重複排除されたイベント一覧
 */
const deduplicateRegularCards = (events: ReturnType<typeof useEvents>['data']) => {
  const regularCardStores = new Set<string>()
  return events.filter((event) => {
    if (event.category !== 'regular_card') {
      return true
    }
    // 店舗ごとに1つだけ表示
    const stores = event.stores || []
    for (const store of stores) {
      if (regularCardStores.has(store)) {
        return false // 既にこの店舗の通常名刺がある
      }
      regularCardStores.add(store)
    }
    // 店舗がない場合はタイトルで判定
    if (stores.length === 0) {
      const key = `no-store-${event.title}`
      if (regularCardStores.has(key)) {
        return false
      }
      regularCardStores.add(key)
    }
    return true
  })
}

/**
 * トップページ用のイベント一覧
 * 以下のいずれかに該当するイベントを表示:
 * - 今後一週間以内に終了する開催中イベント
 * - 今後一週間以内に開催される未開催イベント
 * - 二週間以内に開催が始まった開催中イベント
 */
export const EventList = () => {
  const { data: events = [], isLoading } = useEvents()
  const { completedEvents } = useUserActivity()

  // 以下の3条件のいずれかを満たすイベントを表示し、開始日時・カテゴリ・店舗順でソート
  // 1. 今後一週間以内に終了する開催中イベント
  // 2. 今後一週間以内に開催される未開催イベント
  // 3. 二週間以内に開催が始まった開催中イベント
  const filteredEvents = orderBy(
    events.filter((event) => {
      // 達成済みイベントは非表示
      if (completedEvents.includes(event.uuid)) {
        return false
      }

      // 終了したイベントは非表示
      if (event.status === 'ended') {
        return false
      }

      const currentTime = dayjs()
      const startDate = dayjs(event.startDate)
      const oneWeekAhead = currentTime.add(7, 'day')
      const twoWeeksAgo = currentTime.subtract(14, 'day')

      const isOngoing = event.status === 'ongoing' || event.status === 'last_day'

      // (1) 今後一週間以内に終了する開催中イベント
      if (isOngoing && event.endDate) {
        const endDate = dayjs(event.endDate)
        if (endDate.isAfter(currentTime) && endDate.isBefore(oneWeekAhead)) {
          return true
        }
      }

      // (2) 今後一週間以内に開催される未開催イベント
      if (event.status === 'upcoming') {
        if (startDate.isAfter(currentTime) && startDate.isBefore(oneWeekAhead)) {
          return true
        }
      }

      // (3) 二週間以内に開催が始まった開催中イベント
      if (isOngoing) {
        if (startDate.isAfter(twoWeeksAgo) && !startDate.isAfter(currentTime)) {
          return true
        }
      }

      return false
    }),
    [(e) => dayjs(e.startDate).valueOf(), (e) => e.category, (e) => e.stores?.[0] || ''],
    ['asc', 'asc', 'asc']
  )

  // 通常名刺は店舗ごとに最新のものだけ表示（開始日でソート済みなので最初に出てきたものが最新）
  const upcomingEvents = deduplicateRegularCards(filteredEvents)

  if (isLoading) {
    return (
      <section>
        <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
          <div className='flex items-center gap-2 mb-4'>
            <Calendar className='h-5 w-5 text-brand' />
            <h2 className='text-base font-bold text-foreground'>開催中・開催予定のイベント</h2>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
            {(['sk-0', 'sk-1', 'sk-2'] as const).map((k) => (
              <Skeleton key={k} className='h-28 w-full rounded-lg' />
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='flex items-center gap-2 mb-4'>
          <Calendar className='h-5 w-5 text-brand' />
          <h2 className='text-base font-bold text-foreground'>開催中・開催予定のイベント</h2>
        </div>

        {upcomingEvents.length === 0 ? (
          <p className='text-sm text-muted-foreground py-4'>開催予定のイベントはありません</p>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
            {upcomingEvents.map((event, index) => (
              <EventListItem key={event.uuid} event={event} index={index} />
            ))}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal, delay: 0.6, ease: 'easeOut' }}
          className='mt-4 text-right'
        >
          <Link
            to='/events'
            className='text-sm text-muted-foreground hover:text-foreground font-semibold hover:underline transition-colors'
          >
            イベント一覧
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
