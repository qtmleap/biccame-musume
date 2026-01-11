import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { groupBy, sortBy } from 'lodash-es'
import { Cake, Store } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { StoreData } from '@/schemas/store.dto'

type CalendarEvent = {
  date: string
  character: StoreData
  type: 'character' | 'store'
  years: number
}

type GroupedEvents = {
  day: number
  dayOfWeek: string
  events: CalendarEvent[]
}

type CalendarEventListProps = {
  year: number
  month: number
  events: CalendarEvent[]
}

/**
 * イベントを日付ごとにグループ化する
 */
const groupEventsByDay = (events: CalendarEvent[], year: number, month: number): GroupedEvents[] => {
  const weekDayNames = ['日', '月', '火', '水', '木', '金', '土']
  const grouped = groupBy(events, (event) => dayjs(event.date).date())

  return sortBy(
    Object.entries(grouped).map(([day, evts]) => {
      // 表示している年月の日付で曜日を計算する
      const displayDate = dayjs(`${year}-${month}-${day}`)
      return {
        day: Number(day),
        dayOfWeek: weekDayNames[displayDate.day()],
        events: evts
      }
    }),
    'day'
  )
}

/**
 * カレンダーイベントリスト表示(モバイル用)
 */
export const CalendarEventList = ({ year, month, events }: CalendarEventListProps) => {
  return (
    <div className='space-y-2'>
      {events.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className='py-8 text-center text-muted-foreground'
        >
          今月のイベントはありません
        </motion.div>
      ) : (
        <AnimatePresence mode='wait'>
          <motion.div
            key={`${year}-${month}`}
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ duration: 0.2 }}
          >
            {groupEventsByDay(events, year, month).map((group, groupIndex) => (
              <motion.div
                key={`day-${group.day}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: 0.15,
                  delay: groupIndex * 0.05,
                  ease: 'easeOut'
                }}
                className='flex gap-3 py-2 border-b border-border/50 last:border-b-0'
              >
                {/* 日付部分(カレンダー風) */}
                <div className='flex flex-col items-center justify-start pt-1 w-10 shrink-0'>
                  <span className='text-[10px] text-muted-foreground uppercase'>{group.dayOfWeek}</span>
                  <span className='text-xl font-bold tabular-nums'>{group.day}</span>
                </div>

                {/* イベント一覧(グリッドレイアウト) */}
                <div className='flex-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5 min-w-0'>
                  {group.events.map((event) => {
                    const isCharacter = event.type === 'character'

                    return (
                      <Link
                        key={`${event.character.id}-${event.type}`}
                        to='/characters/$id'
                        params={{ id: event.character.id }}
                      >
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={cn(
                            'flex items-center gap-3 p-2 rounded-lg',
                            isCharacter ? 'bg-pink-500/10' : 'bg-blue-500/10'
                          )}
                        >
                          {/* キャラクター画像 */}
                          <Avatar className='w-10 h-10 shrink-0 border border-border overflow-hidden'>
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
                          <Badge
                            variant='secondary'
                            className={cn(
                              'shrink-0 text-xs flex items-center gap-1',
                              isCharacter
                                ? 'bg-pink-500/20 text-pink-700 dark:text-pink-300'
                                : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                            )}
                          >
                            {isCharacter ? <Cake className='w-3 h-3' /> : <Store className='w-3 h-3' />}
                            {event.years}
                            {isCharacter ? '歳' : '周年'}
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
