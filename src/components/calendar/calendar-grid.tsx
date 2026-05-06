import dayjs from 'dayjs'
import { AnimatePresence, motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DURATION } from '@/lib/motion'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { CALENDAR_LABELS } from '@/locales/app.content'
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
        transition={{ duration: DURATION.fast }}
        className='p-2'
      >
        {/* 曜日ヘッダー */}
        <div className='grid grid-cols-7 mb-1'>
          {weekDays.map((day, index) => (
            <div
              key={day}
              className={cn(
                'text-center font-medium py-1 text-xs',
                index === 0 && 'text-calendar-sunday',
                index === 6 && 'text-calendar-saturday',
                index !== 0 && index !== 6 && 'text-muted-foreground'
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* カレンダーグリッド */}
        <div className='grid grid-cols-7 gap-2'>
          {calendarDays.map((day, index) => {
            if (day === null) {
              // 月初の空セルは index 順で並ぶ固定オフセット (year/month が一意キー)
              // biome-ignore lint/suspicious/noArrayIndexKey: leading offset cells have no inherent id
              return <div key={`empty-${year}-${month}-${index}`} aria-hidden='true' className='min-h-20' />
            }

            const dayEvents = getEventsForDay(events, day)
            const date = dayjs(`${year}-${month}-${day}`)
            const isToday = date.isSame(dayjs(), 'day')
            const isSunday = date.day() === 0
            const isSaturday = date.day() === 6
            const hasEvents = dayEvents.length > 0
            // index ベースで決定論的に並べる: 一日あたり ~16ms ずつ遅らせて 1ヶ月で約 0.5s 以内に収める
            const baseDelay = Math.min(index * 0.016, 0.5)

            return (
              <motion.button
                type='button'
                key={`day-${year}-${month}-${day}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: DURATION.fast,
                  delay: baseDelay,
                  ease: 'easeOut'
                }}
                whileHover={hasEvents ? { scale: 1.06, transition: STICKER_HOVER_TRANSITION } : undefined}
                whileTap={hasEvents ? { scale: 0.96, transition: STICKER_HOVER_TRANSITION } : undefined}
                onClick={() => onDayClick(day, dayEvents)}
                style={hasEvents ? { filter: STICKER_SHADOW_SM } : undefined}
                aria-label={`${year}年${month}月${day}日${hasEvents ? `(イベント${dayEvents.length}件)` : ''}`}
                className={cn(
                  'min-h-20 p-1.5 rounded-xl text-left',
                  isToday ? 'bg-calendar-today border-2 border-calendar-today-border' : 'bg-card border-card',
                  hasEvents && 'cursor-pointer'
                )}
                disabled={!hasEvents}
              >
                <div className='h-full flex flex-col'>
                  {/* 日付 */}
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      isToday && 'text-primary',
                      !isToday && isSunday && 'text-calendar-sunday',
                      !isToday && isSaturday && 'text-calendar-saturday',
                      !isToday && !isSunday && !isSaturday && 'text-foreground'
                    )}
                  >
                    {day}
                  </span>
                  {/* アイコン */}
                  {hasEvents && (
                    <div className='flex-1 flex flex-wrap items-center justify-center gap-1 py-1'>
                      {dayEvents.map((event) => (
                        <Avatar key={`${event.character.id}-${event.type}`} className='w-8 h-8'>
                          <AvatarImage
                            src={event.character.character?.image_url}
                            alt={event.character.character?.name || ''}
                            className='object-cover object-top scale-150 translate-y-2'
                          />
                          <AvatarFallback className='text-xs bg-muted'>
                            {event.character.character?.name?.slice(0, 1) || '?'}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  )}
                </div>
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
