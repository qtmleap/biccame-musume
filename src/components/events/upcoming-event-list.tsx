import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import type { StoreData } from '@/schemas/store.dto'
import { UpcomingEventListItem } from './upcoming-event-list-item'

type UpcomingEvent = {
  character: StoreData
  type: 'character' | 'store'
  date: dayjs.Dayjs
  daysUntil: number
}

type UpcomingEventListProps = {
  characters: StoreData[]
}

/**
 * 直近のイベント一覧コンポーネント
 */
export const UpcomingEventList = ({ characters }: UpcomingEventListProps) => {
  /**
   * 直近のイベントを計算
   */
  const upcomingEvents = useMemo(() => {
    const currentTime = dayjs()
    const events: UpcomingEvent[] = []

    for (const character of characters) {
      if (character.character?.birthday) {
        const birthday = dayjs(character.character.birthday)
        if (birthday.isValid()) {
          const thisYear = currentTime.year()
          let nextBirthday = dayjs().year(thisYear).month(birthday.month()).date(birthday.date())
          if (nextBirthday.isBefore(currentTime, 'day')) {
            nextBirthday = nextBirthday.add(1, 'year')
          }
          const daysUntil = nextBirthday.diff(currentTime, 'day')
          events.push({ character, type: 'character', date: nextBirthday, daysUntil })
        }
      }
    }

    events.sort((a, b) => a.daysUntil - b.daysUntil)
    return events.slice(0, 5)
  }, [characters])

  return (
    <section>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='flex items-center gap-2 mb-4'>
          <Calendar className='h-5 w-5 text-[#e50012]' />
          <h2 className='text-base font-bold text-gray-800'>直近の誕生日</h2>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className='text-center py-4 text-gray-500 text-sm'>誕生日がありません</div>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2'>
            {upcomingEvents.map((event, index) => (
              <UpcomingEventListItem key={`${event.character.id}-${event.type}-${index}`} event={event} index={index} />
            ))}
          </div>
        )}

        {upcomingEvents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6, ease: 'easeOut' }}
            className='mt-4 text-right'
          >
            <Link
              to='/calendar'
              className='text-sm text-gray-700 hover:text-gray-900 font-semibold hover:underline transition-colors'
            >
              今後の誕生日一覧
            </Link>
          </motion.div>
        )}
      </div>
    </section>
  )
}
