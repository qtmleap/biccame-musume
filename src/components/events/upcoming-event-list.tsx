import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import type { Character } from '@/schemas/character.dto'
import { UpcomingEventListItem } from './upcoming-event-list-item'

type UpcomingEvent = {
  character: Character
  type: 'character' | 'store'
  date: dayjs.Dayjs
  daysUntil: number
}

type UpcomingEventListProps = {
  characters: Character[]
}

/**
 * 直近のイベント一覧コンポーネント
 */
export const UpcomingEventList = ({ characters }: UpcomingEventListProps) => {
  /**
   * 直近のイベントを計算
   */
  const upcomingEvents = useMemo(() => {
    const now = dayjs()
    const events: UpcomingEvent[] = []

    for (const character of characters) {
      if (character.character_birthday) {
        const birthday = dayjs(character.character_birthday)
        if (birthday.isValid()) {
          const thisYear = now.year()
          let nextBirthday = dayjs().year(thisYear).month(birthday.month()).date(birthday.date())
          if (nextBirthday.isBefore(now, 'day')) {
            nextBirthday = nextBirthday.add(1, 'year')
          }
          const daysUntil = nextBirthday.diff(now, 'day')
          events.push({ character, type: 'character', date: nextBirthday, daysUntil })
        }
      }
    }

    events.sort((a, b) => a.daysUntil - b.daysUntil)
    return events.slice(0, 5)
  }, [characters])

  return (
    <section className='py-6 md:py-8'>
      <div className='container mx-auto px-4'>
        <div className='max-w-2xl mx-auto'>
          <div className='flex items-center gap-2 mb-4'>
            <Calendar className='h-5 w-5 text-[#e50012]' />
            <h2 className='text-base font-bold text-gray-800'>直近の誕生日</h2>
          </div>

          {upcomingEvents.length === 0 ? (
            <div className='text-center py-4 text-gray-500 text-sm'>誕生日がありません</div>
          ) : (
            <div className='flex flex-col gap-2'>
              {upcomingEvents.map((event, index) => (
                <UpcomingEventListItem
                  key={`${event.character.key}-${event.type}-${index}`}
                  event={event}
                  index={index}
                />
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
      </div>
    </section>
  )
}
