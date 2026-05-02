import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Event, EventStatus } from '@/schemas/event.dto'

export type EventBar = {
  event: Event
  startOffset: number
  duration: number
  status: EventStatus
}

type GanttLayout = {
  dates: Dayjs[]
  chartStartDate: Dayjs
  chartEndDate: Dayjs
  actualMonthEnd: Dayjs
  today: Dayjs
  todayOffset: number
  eventBars: EventBar[]
  monthOffset: number
  setMonthOffset: (offset: number) => void
  scrollLeft: number
  isScrolling: boolean
  isDragging: boolean
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  handleScroll: () => void
  handleMouseDown: (e: React.MouseEvent) => void
  handleMouseMove: (e: React.MouseEvent) => void
  handleMouseUp: () => void
  handleMouseLeave: () => void
  getLabelOffset: (startOffset: number, duration: number) => number
  hasDraggedRef: React.MutableRefObject<boolean>
}

export const useGanttLayout = (events: Event[]): GanttLayout => {
  const [monthOffset, setMonthOffset] = useState(0)

  const { dates, chartStartDate, chartEndDate, actualMonthEnd } = useMemo(() => {
    const today = dayjs().startOf('day')
    const chartStart = today.add(monthOffset, 'month').startOf('month')
    const monthEnd = chartStart.endOf('month')
    const allDates: Dayjs[] = []
    for (let i = 0; i < 38; i++) {
      allDates.push(chartStart.add(i, 'day'))
    }
    const chartEnd = chartStart.add(37, 'day')
    return {
      dates: allDates,
      chartStartDate: chartStart,
      chartEndDate: chartEnd,
      actualMonthEnd: monthEnd
    }
  }, [monthOffset])

  const categoryOrder: Record<Event['category'], number> = useMemo(
    () => ({
      limited_card: 0,
      regular_card: 1,
      ackey: 2,
      other: 3
    }),
    []
  )

  const today = dayjs().startOf('day')
  const todayOffset = today.diff(chartStartDate, 'day')

  const eventBars = useMemo(() => {
    const displayDays = 38

    const deduplicatedEvents = (() => {
      const regularCardStores = new Set<string>()
      return events.filter((event) => {
        if (event.category !== 'regular_card') {
          return true
        }
        const stores = event.stores || []
        for (const store of stores) {
          if (regularCardStores.has(store)) {
            return false
          }
          regularCardStores.add(store)
        }
        if (stores.length === 0) {
          const key = `no-store-${event.title}`
          if (regularCardStores.has(key)) {
            return false
          }
          regularCardStores.add(key)
        }
        return true
      })
    })()

    const sortedEvents = [...deduplicatedEvents].sort((a, b) => {
      const startDiff = dayjs(a.startDate).diff(dayjs(b.startDate))
      if (startDiff !== 0) return startDiff
      return categoryOrder[a.category] - categoryOrder[b.category]
    })

    return sortedEvents
      .map((event) => {
        const eventStart = dayjs(event.startDate).startOf('day')
        const currentTime = dayjs().startOf('day')
        let eventEnd: Dayjs
        if (event.endDate) {
          eventEnd = dayjs(event.endDate).startOf('day')
        } else if (event.endedAt) {
          eventEnd = dayjs(event.endedAt).startOf('day')
        } else {
          const oneMonthLater = currentTime.add(1, 'month')
          const oneWeekFromStart = eventStart.add(1, 'week')
          eventEnd = oneMonthLater.isAfter(oneWeekFromStart) ? oneMonthLater : oneWeekFromStart
        }

        const startOffset = eventStart.diff(chartStartDate, 'day')
        const duration = eventEnd.diff(eventStart, 'day') + 1

        const isPastEndDate = event.endDate ? currentTime.isAfter(dayjs(event.endDate).startOf('day')) : false
        const status: EventStatus = (() => {
          if (event.endedAt != null || isPastEndDate) return 'ended'
          if (currentTime.isBefore(eventStart)) return 'upcoming'
          return 'ongoing'
        })()

        if (eventEnd.isBefore(chartStartDate) || eventStart.isAfter(chartEndDate)) {
          return null
        }

        const clippedStartOffset = Math.max(0, startOffset)
        const clippedDuration =
          startOffset < 0
            ? Math.min(duration + startOffset, displayDays)
            : Math.min(duration, displayDays - clippedStartOffset)

        return {
          event,
          startOffset: clippedStartOffset,
          duration: clippedDuration,
          status
        }
      })
      .filter((bar) => bar !== null) as EventBar[]
  }, [events, chartStartDate, chartEndDate, categoryOrder])

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)
  const isInitialMountRef = useRef(true)

  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 })
  const dragStartYRef = useRef(0)
  const hasDraggedRef = useRef(false)

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }

    rafRef.current = requestAnimationFrame(() => {
      if (!scrollContainerRef.current) return
      setScrollLeft(scrollContainerRef.current.scrollLeft)

      if (isInitialMountRef.current) return

      setIsScrolling(true)

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }

      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false)
      }, 150)
    })
  }, [])

  useEffect(() => {
    if (scrollContainerRef.current) {
      if (monthOffset === 0 && todayOffset >= 0) {
        scrollContainerRef.current.scrollLeft = todayOffset * 32
        setScrollLeft(todayOffset * 32)
      } else {
        scrollContainerRef.current.scrollLeft = 0
        setScrollLeft(0)
      }
      requestAnimationFrame(() => {
        isInitialMountRef.current = false
      })
    }
  }, [todayOffset, monthOffset])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return
    setIsDragging(true)
    hasDraggedRef.current = false
    dragStartRef.current = {
      x: e.clientX,
      scrollLeft: scrollContainerRef.current.scrollLeft
    }
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !scrollContainerRef.current) return
      e.preventDefault()
      const dx = e.clientX - dragStartRef.current.x
      if (Math.abs(dx) > 5) {
        hasDraggedRef.current = true
      }
      scrollContainerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    const node = scrollContainerRef.current
    if (!node) return

    const isHorizontalDragRef = { current: false }

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      hasDraggedRef.current = false
      isHorizontalDragRef.current = false
      dragStartRef.current = {
        x: touch.clientX,
        scrollLeft: node.scrollLeft
      }
      dragStartYRef.current = touch.clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      const dx = touch.clientX - dragStartRef.current.x
      const dy = touch.clientY - dragStartYRef.current

      if (!isHorizontalDragRef.current) {
        if (Math.abs(dx) <= 5 && Math.abs(dy) <= 5) return
        if (Math.abs(dx) <= Math.abs(dy)) return
        isHorizontalDragRef.current = true
        hasDraggedRef.current = true
      }

      e.preventDefault()
      node.scrollLeft = dragStartRef.current.scrollLeft - dx
    }

    node.addEventListener('touchstart', onTouchStart, { passive: true })
    node.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  const getLabelOffset = useCallback(
    (startOffset: number, duration: number) => {
      const barLeft = startOffset * 32
      const barRight = barLeft + duration * 32
      if (scrollLeft > barLeft && scrollLeft < barRight - 100) {
        return scrollLeft - barLeft
      }
      return 0
    },
    [scrollLeft]
  )

  return {
    dates,
    chartStartDate,
    chartEndDate,
    actualMonthEnd,
    today,
    todayOffset,
    eventBars,
    monthOffset,
    setMonthOffset,
    scrollLeft,
    isScrolling,
    isDragging,
    scrollContainerRef,
    handleScroll,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    getLabelOffset,
    hasDraggedRef
  }
}
