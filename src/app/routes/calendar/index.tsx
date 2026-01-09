import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Suspense, useMemo, useState } from 'react'
import { CalendarHeader, CalendarMonthDots, CalendarMonthTabs } from '@/components/calendar/calendar-controls'
import { CalendarEventDrawerContent } from '@/components/calendar/calendar-event-drawer-content'
import { CalendarEventList } from '@/components/calendar/calendar-event-list'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useCharacters } from '@/hooks/useCharacters'
import { type CalendarEvent, filterMonthEvents } from '@/utils/calendar'

/**
 * カレンダーコンテンツ
 */
const CalendarContent = () => {
  const { data: allCharacters } = useCharacters()
  const today = dayjs()
  const [selectedYear, setSelectedYear] = useState(today.year())
  const [selectedMonth, setSelectedMonth] = useState(today.month() + 1)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')

  const events = useMemo(() => {
    return filterMonthEvents(allCharacters, selectedMonth, selectedYear)
  }, [allCharacters, selectedMonth, selectedYear])

  const handleDayClick = (day: number, dayEvents: CalendarEvent[]) => {
    if (dayEvents.length > 0) {
      setSelectedDay(day)
      setDrawerOpen(true)
    }
  }

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((prev) => prev - 1)
      setSelectedMonth(12)
    } else {
      setSelectedMonth((prev) => prev - 1)
    }
  }

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((prev) => prev + 1)
      setSelectedMonth(1)
    } else {
      setSelectedMonth((prev) => prev + 1)
    }
  }

  const handleCurrentMonth = () => {
    const currentTime = dayjs()
    setSelectedYear(currentTime.year())
    setSelectedMonth(currentTime.month() + 1)
  }

  const selectedDayEvents = selectedDay ? events.filter((event) => dayjs(event.date).date() === selectedDay) : []

  return (
    <div className='mx-auto p-4 md:p-8 space-y-6 md:space-y-8 max-w-6xl'>
      <CalendarHeader
        year={selectedYear}
        month={selectedMonth}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onCurrentMonth={handleCurrentMonth}
      />

      <CalendarMonthDots selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />
      <CalendarMonthTabs selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />

      {isMobile ? (
        <CalendarEventList year={selectedYear} month={selectedMonth} events={events} />
      ) : (
        <CalendarGrid year={selectedYear} month={selectedMonth} events={events} onDayClick={handleDayClick} />
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction='right'>
        <DrawerContent className='w-80 sm:max-w-80!'>
          <DrawerHeader>
            <DrawerTitle>
              {selectedYear}年{selectedMonth}月{selectedDay}日
            </DrawerTitle>
          </DrawerHeader>
          <CalendarEventDrawerContent
            year={selectedYear}
            month={selectedMonth}
            day={selectedDay || 0}
            events={selectedDayEvents}
          />
        </DrawerContent>
      </Drawer>

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
const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <CalendarContent />
  </Suspense>
)

export const Route = createFileRoute('/calendar/')({
  component: RouteComponent
})
