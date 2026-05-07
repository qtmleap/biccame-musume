import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { groupBy, sortBy } from 'lodash-es'
import { Cake, CalendarOff, Store } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DURATION } from '@/lib/motion'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { CALENDAR_LABELS } from '@/locales/app.content'
import type { StoreData } from '@/schemas/store.dto'
import { getHolidayName } from '@/utils/holidays'

type CalendarEvent = {
  date: string
  character: StoreData
  type: 'character' | 'store'
  years: number
}

type GroupedEvents = {
  day: number
  dayOfWeek: string
  holidayName: string | null
  events: CalendarEvent[]
}

type CalendarEventListProps = {
  year: number
  month: number
  events: CalendarEvent[]
  onDayClick?: (day: number, dayEvents: CalendarEvent[]) => void
}

/**
 * イベントと祝日を日付ごとにグループ化する
 */
const groupEventsByDay = (events: CalendarEvent[], year: number, month: number): GroupedEvents[] => {
  const weekDayNames = CALENDAR_LABELS.weekDays
  const grouped = groupBy(events, (event) => dayjs(event.date).date())
  const daysInMonth = dayjs(`${year}-${month}-01`).daysInMonth()

  const dayMap = new Map<number, CalendarEvent[]>()
  Object.entries(grouped).forEach(([day, evts]) => {
    dayMap.set(Number(day), evts)
  })

  // 祝日のある日も dayMap に追加(イベントがなければ空配列)
  for (let day = 1; day <= daysInMonth; day++) {
    if (getHolidayName(year, month, day) !== null && !dayMap.has(day)) {
      dayMap.set(day, [])
    }
  }

  return sortBy(
    Array.from(dayMap.entries()).map(([day, evts]) => {
      const displayDate = dayjs(`${year}-${month}-${day}`)
      return {
        day,
        dayOfWeek: weekDayNames[displayDate.day()],
        holidayName: getHolidayName(year, month, day),
        events: evts
      }
    }),
    'day'
  )
}

/**
 * カレンダーイベントリスト表示(モバイル用)
 */
export const CalendarEventList = ({ year, month, events, onDayClick }: CalendarEventListProps) => {
  const groups = groupEventsByDay(events, year, month)

  return (
    <div className='space-y-2'>
      {groups.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION.normal }}
          className='flex flex-col items-center gap-2 py-12 text-center text-muted-foreground'
        >
          <CalendarOff className='w-8 h-8 opacity-60' aria-hidden='true' />
          <span className='text-sm'>今月のイベントはありません</span>
        </motion.div>
      ) : (
        <AnimatePresence mode='wait'>
          <motion.div
            key={`${year}-${month}`}
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ duration: DURATION.fast }}
          >
            {groups.map((group, groupIndex) => (
              <motion.div
                key={`day-${group.day}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: DURATION.fast,
                  delay: groupIndex * 0.05,
                  ease: 'easeOut'
                }}
                className='flex gap-3 py-2 border-b border-border/50 last:border-b-0'
              >
                {/* 日付部分(カレンダー風) */}
                <button
                  type='button'
                  onClick={() => onDayClick?.(group.day, group.events)}
                  aria-label={`${month}月${group.day}日${group.holidayName ? `(${group.holidayName})` : ''}のイベントを開く`}
                  disabled={group.events.length === 0}
                  className={cn(
                    'flex flex-col items-center justify-center min-w-11 min-h-11 shrink-0 transition-opacity',
                    group.events.length > 0 && 'cursor-pointer hover:opacity-70'
                  )}
                >
                  <span className='text-xs text-muted-foreground uppercase'>{group.dayOfWeek}</span>
                  <span className={cn('text-xl font-bold tabular-nums', group.holidayName && 'text-calendar-sunday')}>
                    {group.day}
                  </span>
                </button>

                {/* イベント一覧(グリッドレイアウト) */}
                <div className='flex-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5 min-w-0'>
                  {group.holidayName && (
                    <div className='col-span-full flex items-center gap-2 px-2 py-1 rounded-xl bg-calendar-sunday/10 text-calendar-sunday text-xs font-medium'>
                      <span>祝</span>
                      <span>{group.holidayName}</span>
                    </div>
                  )}
                  {group.events.map((event) => {
                    const isCharacter = event.type === 'character'

                    return (
                      <Link
                        key={`${event.character.id}-${event.type}`}
                        to='/characters/$id'
                        params={{ id: event.character.id }}
                      >
                        <motion.div
                          style={{ filter: STICKER_SHADOW_SM }}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.97 }}
                          transition={STICKER_HOVER_TRANSITION}
                          className={cn(
                            'flex items-center gap-3 p-2 rounded-xl border-card',
                            isCharacter ? 'bg-action-interest/15' : 'bg-info/15'
                          )}
                        >
                          {/* キャラクター画像 */}
                          <Avatar className='w-10 h-10'>
                            <AvatarImage
                              src={event.character.character?.image_url}
                              alt={event.character.character?.name || ''}
                              className='object-cover object-top scale-150 translate-y-2'
                            />
                            <AvatarFallback>{event.character.character?.name?.slice(0, 1) || '?'}</AvatarFallback>
                          </Avatar>

                          {/* 情報 */}
                          <div className='flex-1 min-w-0'>
                            <p className='text-sm font-medium truncate'>{event.character.character?.name}</p>
                            <p className='text-xs text-muted-foreground truncate'>{event.character.store?.name}</p>
                          </div>

                          {/* バッジ */}
                          <Badge variant='secondary' className='bg-card text-foreground border-card'>
                            {isCharacter ? <Cake className='w-3 h-3' /> : <Store className='w-3 h-3' />}
                            {event.years}
                            {isCharacter ? CALENDAR_LABELS.age : CALENDAR_LABELS.anniversary}
                          </Badge>
                        </motion.div>
                      </Link>
                    )
                  })}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
