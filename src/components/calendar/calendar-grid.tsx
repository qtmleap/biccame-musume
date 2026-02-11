import dayjs from 'dayjs'
import { AnimatePresence, motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { StoreData } from '@/schemas/store.dto'

type CalendarEvent = {
  date: string
  character: StoreData
  type: 'character' | 'store'
  years: number
}

type CalendarGridProps = {
  year: number
  month: number
  events: CalendarEvent[]
  onDayClick: (day: number, events: CalendarEvent[]) => void
}

/**
 * 指定月のカレンダー日付配列を生成する
 */
const generateCalendarDays = (year: number, month: number): (number | null)[] => {
  const firstDay = dayjs(`${year}-${month}-01`)
  const daysInMonth = firstDay.daysInMonth()
  const firstDayOfWeek = firstDay.day()

  const days: (number | null)[] = []

  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day)
  }

  return days
}

/**
 * 指定日のイベントを取得する
 */
const getEventsForDay = (events: CalendarEvent[], day: number): CalendarEvent[] => {
  return events.filter((event) => {
    return dayjs(event.date).date() === day
  })
}

/**
 * カレンダーグリッド表示（デスクトップ用）
 */
export const CalendarGrid = ({ year, month, events, onDayClick }: CalendarGridProps) => {
  const weekDays = CALENDAR_LABELS.weekDays
  const calendarDays = generateCalendarDays(year, month)

  return (
    <AnimatePresence mode='wait'>
      <motion.div
        key={`${year}-${month}`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className='p-2'
      >
        {/* 曜日ヘッダー */}
        <div className='grid grid-cols-7 mb-1'>
          {weekDays.map((day, index) => (
            <div
              key={day}
              className={cn(
                'text-center font-medium py-1 text-xs',
                index === 0 && 'text-rose-500',
                index === 6 && 'text-sky-500',
                index !== 0 && index !== 6 && 'text-muted-foreground'
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* カレンダーグリッド */}
        <div className='grid grid-cols-7 gap-1'>
          {calendarDays.map((day, index) => {
            const dayEvents = day ? getEventsForDay(events, day) : []
            const date = day ? dayjs(`${year}-${month}-${day}`) : null
            const isToday = date?.isSame(dayjs(), 'day') ?? false
            const isSunday = date?.day() === 0
            const isSaturday = date?.day() === 6
            const hasEvents = dayEvents.length > 0
            const baseDelay = hasEvents ? Math.random() * 0.1 : 0.15 + Math.random() * 0.3

            return (
              <motion.button
                type='button'
                key={`day-${year}-${month}-${day ?? `empty-${index}`}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: 0.15,
                  delay: baseDelay,
                  ease: 'easeOut'
                }}
                whileHover={hasEvents ? { scale: 1.05 } : undefined}
                whileTap={hasEvents ? { scale: 0.95 } : undefined}
                onClick={() => day !== null && onDayClick(day, dayEvents)}
                className={cn(
                  'min-h-20 p-1.5 rounded-lg transition-all text-left',
                  day === null && 'bg-transparent cursor-default',
                  day !== null && isToday && 'bg-rose-100 border border-rose-300',
                  day !== null && !isToday && 'bg-white border border-gray-200 hover:bg-gray-50',
                  hasEvents && 'cursor-pointer'
                )}
                disabled={!hasEvents}
              >
                {day !== null && (
                  <div className='h-full flex flex-col'>
                    {/* 日付 */}
                    <span
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        isToday && 'text-primary',
                        !isToday && isSunday && 'text-rose-500',
                        !isToday && isSaturday && 'text-sky-500',
                        !isToday && !isSunday && !isSaturday && 'text-foreground'
                      )}
                    >
                      {day}
                    </span>
                    {/* アイコン */}
                    {hasEvents && (
                      <div className='flex-1 flex flex-wrap items-center justify-center gap-1 py-1'>
                        {dayEvents.map((event) => (
                          <Avatar
                            key={`${event.character.id}-${event.type}`}
                            className={cn(
                              'w-8 h-8 ring-2 overflow-hidden',
                              event.type === 'character' ? 'ring-pink-400/50' : 'ring-blue-400/50'
                            )}
                          >
                            <AvatarImage
                              src={event.character.character?.image_url}
                              alt={event.character.character?.name || ''}
                              className='object-cover object-top scale-150 translate-y-2'
                            />
                            <AvatarFallback className='text-[10px] bg-muted'>
                              {event.character.character?.name?.slice(0, 1) || '?'}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
