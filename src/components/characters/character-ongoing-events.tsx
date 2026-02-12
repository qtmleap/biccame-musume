import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Separator } from '@/components/ui/separator'
import { useEvents } from '@/hooks/use-events'
import { EVENT_LABELS } from '@/locales/app.content'
import { STATUS_BADGE_SM } from '@/locales/component'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type CharacterOngoingEventsProps = {
  storeKey: StoreKey
}

type OngoingEventItemProps = {
  event: Event
  isLast: boolean
}

/**
 * 開催中イベントのリストアイテム
 */
const OngoingEventItem = ({ event, isLast }: OngoingEventItemProps) => {
  return (
    <>
      <Link
        to='/events/$uuid'
        params={{ uuid: event.uuid }}
        className='flex items-start gap-3 hover:opacity-70 transition-opacity'
      >
        <Calendar className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
        <div className='min-w-0 flex-1'>
          <p className='text-sm text-gray-900'>{event.title}</p>
          <p className='text-sm text-gray-500'>
            {dayjs(event.startDate).format('YYYY/MM/DD')}
            {event.endDate ? `〜${dayjs(event.endDate).format('YYYY/MM/DD')}` : EVENT_LABELS.untilEnd}
          </p>
        </div>
        {STATUS_BADGE_SM[event.status]()}
      </Link>
      {!isLast && <Separator className='my-3' />}
    </>
  )
}

/**
 * キャラクターに関連する直近のイベント一覧
 */
export const CharacterOngoingEvents = ({ storeKey }: CharacterOngoingEventsProps) => {
  const { data: events } = useEvents()

  // 開催中・最終日・開催予定のイベントをフィルタリングし、開始日順にソート
  const upcomingEvents = useMemo(() => {
    return events
      .filter((event) => {
        // 開催中、最終日、開催予定のみ
        if (event.status !== 'ongoing' && event.status !== 'last_day' && event.status !== 'upcoming') {
          return false
        }
        // このキャラクターの店舗が含まれているか
        return event.stores.includes(storeKey)
      })
      .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
  }, [events, storeKey])

  if (upcomingEvents.length === 0) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className='space-y-3 mb-6'
    >
      <h2 className='text-xl font-bold text-gray-900'>直近のイベント</h2>
      <div className='space-y-3'>
        {upcomingEvents.map((event, index) => (
          <OngoingEventItem key={event.uuid} event={event} isLast={index === upcomingEvents.length - 1} />
        ))}
      </div>
    </motion.div>
  )
}
