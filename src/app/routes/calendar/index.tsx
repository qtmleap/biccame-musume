import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { groupBy, sortBy } from 'lodash-es'
import { Cake, ChevronLeft, ChevronRight, Store } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Suspense, useMemo, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useCharacters } from '@/hooks/useCharacters'
import { cn } from '@/lib/utils'
import type { Character } from '@/schemas/character.dto'

export const Route = createFileRoute('/calendar/')({
  component: RouteComponent
})

type CalendarEvent = {
  date: string
  character: Character
  type: 'character' | 'store'
  years: number
}

/**
 * 年齢/周年を計算する（対象年を指定）
 */
const calculateYears = (birthday: string, targetYear: number): number => {
  const birthDate = new Date(birthday)
  return targetYear - birthDate.getFullYear()
}

/**
 * 指定月のイベントをフィルタリングする
 */
const filterMonthEvents = (characters: Character[], targetMonth: number, targetYear: number): CalendarEvent[] => {
  const events: CalendarEvent[] = []

  characters.forEach((character) => {
    // キャラクター誕生日のチェック
    if (character.character_birthday) {
      const birthDate = new Date(character.character_birthday)
      if (birthDate.getMonth() + 1 === targetMonth) {
        events.push({
          date: character.character_birthday,
          character,
          type: 'character',
          years: calculateYears(character.character_birthday, targetYear)
        })
      }
    }

    // 店舗誕生日のチェック
    if (character.store_birthday) {
      const birthDate = new Date(character.store_birthday)
      if (birthDate.getMonth() + 1 === targetMonth) {
        events.push({
          date: character.store_birthday,
          character,
          type: 'store',
          years: calculateYears(character.store_birthday, targetYear)
        })
      }
    }
  })

  // 日付順にソート（日のみで比較）
  return events.sort((a, b) => {
    const dayA = new Date(a.date).getDate()
    const dayB = new Date(b.date).getDate()
    return dayA - dayB
  })
}

/**
 * 指定月のカレンダー日付配列を生成する
 */
const generateCalendarDays = (year: number, month: number): (number | null)[] => {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const firstDayOfWeek = firstDay.getDay() // 0=日曜日
  const daysInMonth = lastDay.getDate()

  const days: (number | null)[] = []

  // 月初の空白
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null)
  }

  // 日付
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
    const eventDate = new Date(event.date)
    return eventDate.getDate() === day
  })
}

type GroupedEvents = {
  day: number
  dayOfWeek: string
  events: CalendarEvent[]
}

/**
 * イベントを日付ごとにグループ化する（lodash使用）
 */
const groupEventsByDay = (events: CalendarEvent[]): GroupedEvents[] => {
  const weekDayNames = ['日', '月', '火', '水', '木', '金', '土']
  const grouped = groupBy(events, (event) => new Date(event.date).getDate())

  return sortBy(
    Object.entries(grouped).map(([day, evts]) => ({
      day: Number(day),
      dayOfWeek: weekDayNames[new Date(evts[0].date).getDay()],
      events: evts
    })),
    'day'
  )
}

/**
 * ローディングフォールバック
 */
const LoadingFallback = () => (
  <div className='mx-auto p-4 md:p-8 max-w-6xl'>
    <div className='flex items-center justify-center py-8'>
      <div className='text-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4' />
        <p className='text-muted-foreground'>読み込み中...</p>
      </div>
    </div>
  </div>
)

/**
 * カレンダーコンテンツ
 */
const CalendarContent = () => {
  const { data: allCharacters } = useCharacters()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')

  /**
   * 現在の月のイベントを計算
   */
  const events = useMemo(() => {
    return filterMonthEvents(allCharacters, selectedMonth, selectedYear)
  }, [allCharacters, selectedMonth, selectedYear])

  /**
   * 日付クリック時にDrawerを開く
   */
  const handleDayClick = (day: number, dayEvents: CalendarEvent[]) => {
    if (dayEvents.length > 0) {
      setSelectedDay(day)
      setDrawerOpen(true)
    }
  }

  const today = new Date()
  const currentMonthName = `${selectedYear}年${selectedMonth}月`
  const calendarDays = generateCalendarDays(selectedYear, selectedMonth)
  const weekDays = ['日', '月', '火', '水', '木', '金', '土']

  /**
   * 前月に移動
   */
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((prev) => prev - 1)
      setSelectedMonth(12)
    } else {
      setSelectedMonth((prev) => prev - 1)
    }
  }

  /**
   * 次月に移動
   */
  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((prev) => prev + 1)
      setSelectedMonth(1)
    } else {
      setSelectedMonth((prev) => prev + 1)
    }
  }

  return (
    <div className='mx-auto p-4 md:p-8 space-y-6 md:space-y-8 max-w-6xl'>
      {/* ヘッダー部分 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className='flex items-center justify-between'
      >
        <Button variant='ghost' size='icon' onClick={handlePrevMonth} className='rounded-full'>
          <ChevronLeft className='h-5 w-5' />
        </Button>
        <button
          type='button'
          onClick={() => {
            setSelectedYear(today.getFullYear())
            setSelectedMonth(today.getMonth() + 1)
          }}
          className='text-2xl md:text-4xl font-bold tracking-tight text-center tabular-nums hover:text-primary transition-colors'
        >
          {currentMonthName}
        </button>
        <Button variant='ghost' size='icon' onClick={handleNextMonth} className='rounded-full'>
          <ChevronRight className='h-5 w-5' />
        </Button>
      </motion.div>

      {/* ページネーションドット（モバイル） */}
      <div className='flex justify-center gap-1.5 md:hidden'>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
          <button
            key={month}
            type='button'
            onClick={() => setSelectedMonth(month)}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              selectedMonth === month ? 'bg-primary scale-125' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
            aria-label={`${month}月に移動`}
          />
        ))}
      </div>

      {/* 月選択タブ（デスクトップ） */}
      <div className='hidden md:flex gap-1 overflow-x-auto pb-2 justify-center'>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
          <Button
            key={month}
            variant='ghost'
            onClick={() => setSelectedMonth(month)}
            size='sm'
            className={cn(
              'shrink-0 rounded-full px-4 transition-all',
              selectedMonth === month
                ? 'bg-muted font-semibold text-foreground'
                : 'hover:bg-muted/50 text-muted-foreground'
            )}
          >
            {month}月
          </Button>
        ))}
      </div>

      {/* モバイル: リスト表示（日付ごとにグループ化） */}
      {isMobile ? (
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
                key={`${selectedYear}-${selectedMonth}`}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.2 }}
              >
                {groupEventsByDay(events).map((group, groupIndex) => (
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
                    {/* 日付部分（カレンダー風） */}
                    <div className='flex flex-col items-center justify-start pt-1 w-10 shrink-0'>
                      <span className='text-[10px] text-muted-foreground uppercase'>{group.dayOfWeek}</span>
                      <span className='text-xl font-bold tabular-nums'>{group.day}</span>
                    </div>

                    {/* イベント一覧 */}
                    <div className='flex-1 space-y-1.5 min-w-0'>
                      {group.events.map((event) => {
                        const isCharacter = event.type === 'character'

                        return (
                          <motion.div
                            key={`${event.character.key}-${event.type}`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                              'flex items-center gap-3 p-2 rounded-lg',
                              isCharacter ? 'bg-pink-500/10' : 'bg-blue-500/10'
                            )}
                          >
                            {/* キャラクター画像 */}
                            <Avatar className='w-10 h-10 shrink-0 border border-border'>
                              <AvatarImage
                                src={event.character.profile_image_url}
                                alt={event.character.character_name}
                              />
                              <AvatarFallback>{event.character.character_name.slice(0, 1)}</AvatarFallback>
                            </Avatar>

                            {/* 情報 */}
                            <div className='flex-1 min-w-0'>
                              <p className='text-sm font-medium truncate'>{event.character.character_name}</p>
                              <p className='text-xs text-muted-foreground truncate'>{event.character.store_name}</p>
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
                        )
                      })}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      ) : (
        /* デスクトップ: カレンダー表示 */
        <AnimatePresence mode='wait'>
          <motion.div
            key={`${selectedYear}-${selectedMonth}`}
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
                const date = day ? dayjs(`${selectedYear}-${selectedMonth}-${day}`) : null
                const isToday = date?.isSame(dayjs(), 'day') ?? false
                const isSunday = date?.day() === 0
                const isSaturday = date?.day() === 6
                const hasEvents = dayEvents.length > 0
                // イベントのある日は早めに、ない日はランダムに遅く表示
                const baseDelay = hasEvents ? Math.random() * 0.1 : 0.15 + Math.random() * 0.3
                const animationDelay = baseDelay

                return (
                  <motion.button
                    type='button'
                    key={`day-${selectedYear}-${selectedMonth}-${day ?? `empty-${index}`}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: 0.15,
                      delay: animationDelay,
                      ease: 'easeOut'
                    }}
                    whileHover={hasEvents ? { scale: 1.05 } : undefined}
                    whileTap={hasEvents ? { scale: 0.95 } : undefined}
                    onClick={() => day !== null && handleDayClick(day, dayEvents)}
                    className={cn(
                      'min-h-20 p-1.5 rounded-lg transition-all text-left',
                      day === null && 'bg-transparent cursor-default',
                      day !== null && isToday && 'bg-primary/10',
                      day !== null && !isToday && 'bg-card/50 hover:bg-muted/50',
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
                                key={`${event.character.key}-${event.type}`}
                                className={cn(
                                  'w-8 h-8 ring-2',
                                  event.type === 'character' ? 'ring-pink-400/50' : 'ring-blue-400/50'
                                )}
                              >
                                <AvatarImage
                                  src={event.character.profile_image_url}
                                  alt={event.character.character_name}
                                />
                                <AvatarFallback className='text-[10px] bg-muted'>
                                  {event.character.character_name.slice(0, 1)}
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
      )}

      {/* Drawer: 日付詳細表示 */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction='right'>
        <DrawerContent className='w-80 sm:max-w-80!'>
          <DrawerHeader>
            <DrawerTitle>
              {selectedYear}年{selectedMonth}月{selectedDay}日
            </DrawerTitle>
          </DrawerHeader>
          <div className='px-4 pb-4 space-y-3 overflow-y-auto'>
            {selectedDay &&
              getEventsForDay(events, selectedDay).map((event, eventIndex) => {
                const isCharacter = event.type === 'character'
                return (
                  <motion.div
                    key={`drawer-${event.character.key}-${event.type}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: 0.15,
                      delay: eventIndex * 0.05,
                      ease: 'easeOut'
                    }}
                  >
                    <Link
                      to='/characters/$id'
                      params={{ id: event.character.key }}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg transition-colors',
                        isCharacter ? 'bg-pink-500/10 hover:bg-pink-500/20' : 'bg-blue-500/10 hover:bg-blue-500/20'
                      )}
                    >
                      <Avatar className='w-12 h-12 border border-border'>
                        <AvatarImage src={event.character.profile_image_url} alt={event.character.character_name} />
                        <AvatarFallback>{event.character.character_name.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div className='flex-1 min-w-0'>
                        <p className='font-medium truncate'>{event.character.character_name}</p>
                        <p className='text-sm text-muted-foreground truncate'>{event.character.store_name}</p>
                        <Badge
                          variant='secondary'
                          className={cn(
                            'mt-1 text-xs flex items-center gap-1 w-fit',
                            isCharacter
                              ? 'bg-pink-500/20 text-pink-700 dark:text-pink-300'
                              : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          )}
                        >
                          {isCharacter ? <Cake className='w-3 h-3' /> : <Store className='w-3 h-3' />}
                          {event.years}
                          {isCharacter ? '歳' : '周年'}
                        </Badge>
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant='outline'>閉じる</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* 凡例 */}
      <div className='flex flex-wrap justify-center gap-4 text-sm text-muted-foreground'>
        <div className='flex items-center gap-2'>
          <div className='w-4 h-4 rounded bg-linear-to-r from-pink-500/30 to-rose-500/30 border border-pink-500/30' />
          <span>キャラクター誕生日</span>
        </div>
        <div className='flex items-center gap-2'>
          <div className='w-4 h-4 rounded bg-linear-to-r from-blue-500/30 to-cyan-500/30 border border-blue-500/30' />
          <span>店舗記念日</span>
        </div>
      </div>
    </div>
  )
}

/**
 * ルートコンポーネント
 */
function RouteComponent() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CalendarContent />
    </Suspense>
  )
}
