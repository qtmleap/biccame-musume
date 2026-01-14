import { Link } from '@tanstack/react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { ExternalLink } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import appContent from '@/locales/app.content'
import type { Event, EventStatus } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * スクロールバーを非表示にするスタイル（Chrome/Safari用）
 */
const hideScrollbarStyle = `
  .gantt-scroll-container::-webkit-scrollbar {
    display: none;
  }
`

/**
 * カテゴリに応じた色を返す
 */
const getCategoryColor = (category: Event['category'], status: EventStatus) => {
  if (status === 'ended') {
    return 'bg-gray-400 opacity-60'
  }
  switch (category) {
    case 'limited_card':
      return 'bg-purple-700'
    case 'regular_card':
      return 'bg-blue-600'
    case 'ackey':
      return 'bg-amber-600'
    default:
      return 'bg-pink-600'
  }
}

/**
 * 日付範囲を生成
 */
const _generateDateRange = (startDate: Dayjs, endDate: Dayjs): Dayjs[] => {
  const dates: Dayjs[] = []
  let current = startDate
  while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
    dates.push(current)
    current = current.add(1, 'day')
  }
  return dates
}

type EventGanttChartProps = {
  events: Event[]
}

/**
 * カスタムガントチャートコンポーネント
 */
export const EventGanttChart = ({ events }: EventGanttChartProps) => {
  // 表示開始月のオフセット（0=今月、-1=先月、1=来月）
  const [monthOffset, setMonthOffset] = useState(0)

  // 表示する日付範囲を計算
  const { dates, chartStartDate, actualMonthEnd } = useMemo(() => {
    const today = dayjs().startOf('day')
    // 指定月の1日から表示開始
    const chartStart = today.add(monthOffset, 'month').startOf('month')
    // 実際の月の最終日
    const monthEnd = chartStart.endOf('month')
    // 常に31日分生成
    const allDates: Dayjs[] = []
    for (let i = 0; i < 31; i++) {
      allDates.push(chartStart.add(i, 'day'))
    }
    return {
      dates: allDates,
      chartStartDate: chartStart,
      actualMonthEnd: monthEnd
    }
  }, [monthOffset])

  // カテゴリの優先順位
  const categoryOrder: Record<Event['category'], number> = {
    limited_card: 0,
    regular_card: 1,
    ackey: 2,
    other: 3
  }

  const today = dayjs().startOf('day')
  const todayOffset = today.diff(chartStartDate, 'day')

  // その月の実際の日数を計算
  const _daysInMonth = useMemo(() => actualMonthEnd.diff(chartStartDate, 'day') + 1, [actualMonthEnd, chartStartDate])

  // イベントのバー位置を計算（開始日→カテゴリ順でソート）
  const eventBars = useMemo(() => {
    // その月の実際の日数を計算
    const daysInMonth = actualMonthEnd.diff(chartStartDate, 'day') + 1

    // まずイベントをソート: 開始日 → カテゴリ順
    const sortedEvents = [...events].sort((a, b) => {
      const startDiff = dayjs(a.startDate).diff(dayjs(b.startDate))
      if (startDiff !== 0) return startDiff
      return categoryOrder[a.category] - categoryOrder[b.category]
    })

    return sortedEvents
      .map((event) => {
        const eventStart = dayjs(event.startDate).startOf('day')
        const currentTime = dayjs().startOf('day')
        // 終了日がない場合の処理
        let eventEnd: Dayjs
        if (event.endDate) {
          eventEnd = dayjs(event.endDate).startOf('day')
        } else if (event.endedAt) {
          // 実際の終了日がある場合はそれを使用
          eventEnd = dayjs(event.endedAt).startOf('day')
        } else {
          // 終了日が未指定かつ終わっていない場合は「現在日時+1ヶ月」または「開始時刻+1週間」の遅い方
          const oneMonthLater = currentTime.add(1, 'month')
          const oneWeekFromStart = eventStart.add(1, 'week')
          eventEnd = oneMonthLater.isAfter(oneWeekFromStart) ? oneMonthLater : oneWeekFromStart
        }

        const startOffset = eventStart.diff(chartStartDate, 'day')
        const duration = eventEnd.diff(eventStart, 'day') + 1

        // ガントチャート用のステータス判定
        // schemaのstatusはendedAtのみで判定するが、ガントチャートではendDateも考慮
        const isPastEndDate = event.endDate ? currentTime.isAfter(dayjs(event.endDate).startOf('day')) : false
        const status: EventStatus = (() => {
          if (event.endedAt != null || isPastEndDate) return 'ended'
          if (currentTime.isBefore(eventStart)) return 'upcoming'
          return 'ongoing'
        })()

        // 終了日がチャート開始日より前なら表示しない
        if (eventEnd.isBefore(chartStartDate)) {
          return null
        }

        // チャート開始より前に始まったイベントは、その分durationを短くする
        // また、実際の月の日数を超えないように制限
        const clippedStartOffset = Math.max(0, startOffset)
        const clippedDuration =
          startOffset < 0
            ? Math.min(duration + startOffset, daysInMonth)
            : Math.min(duration, daysInMonth - clippedStartOffset)

        return {
          event,
          startOffset: clippedStartOffset,
          duration: clippedDuration,
          status
        }
      })
      .filter((bar) => bar !== null)
  }, [events, chartStartDate, actualMonthEnd])

  const visibleEventBars = eventBars

  // スクロールコンテナのref
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // スクロール位置を保持
  const [scrollLeft, setScrollLeft] = useState(0)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialMountRef = useRef(true)

  // ドラッグスクロール用のstate
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 })
  const hasDraggedRef = useRef(false)

  // スクロールイベントハンドラ
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setScrollLeft(scrollContainerRef.current.scrollLeft)

      // 初回マウント時はスクロールアニメーションをスキップ
      if (isInitialMountRef.current) return

      setIsScrolling(true)

      // 既存のタイマーをクリア
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }

      // 150ms後にスクロール終了とみなす
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false)
      }, 150)
    }
  }, [])

  // 初期表示時に今日の日付が見える位置にスクロール（今月のみ）
  useEffect(() => {
    if (scrollContainerRef.current) {
      // 今月の場合のみ今日の位置にスクロール、それ以外は月初め
      if (monthOffset === 0 && todayOffset >= 0) {
        scrollContainerRef.current.scrollLeft = todayOffset * 32
        setScrollLeft(todayOffset * 32)
      } else {
        scrollContainerRef.current.scrollLeft = 0
        setScrollLeft(0)
      }
      // 初回スクロール後にフラグをクリア
      requestAnimationFrame(() => {
        isInitialMountRef.current = false
      })
    }
  }, [todayOffset, monthOffset])

  // ドラッグ開始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return
    setIsDragging(true)
    hasDraggedRef.current = false
    dragStartRef.current = {
      x: e.clientX,
      scrollLeft: scrollContainerRef.current.scrollLeft
    }
  }, [])

  // ドラッグ中
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !scrollContainerRef.current) return
      e.preventDefault()
      const dx = e.clientX - dragStartRef.current.x
      // 5px以上動いたらドラッグとみなす
      if (Math.abs(dx) > 5) {
        hasDraggedRef.current = true
      }
      scrollContainerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx
    },
    [isDragging]
  )

  // ドラッグ終了
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // マウスがコンテナ外に出た場合もドラッグ終了
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  /**
   * バー内のラベルオフセットを計算
   * スクロール位置に応じてラベルが常に見える位置に表示される
   */
  const getLabelOffset = useCallback(
    (startOffset: number, duration: number) => {
      const barLeft = startOffset * 32
      const barRight = barLeft + duration * 32
      // スクロール位置がバーの範囲内にある場合、ラベルをスクロール位置に追従させる
      if (scrollLeft > barLeft && scrollLeft < barRight - 100) {
        return scrollLeft - barLeft
      }
      return 0
    },
    [scrollLeft]
  )

  return (
    <TooltipProvider>
      {/* Chrome/Safari用スクロールバー非表示スタイル */}
      <style>{hideScrollbarStyle}</style>
      <div className='relative'>
        {/* ヘッダー: 月選択 */}
        <div className='grid grid-cols-5 gap-2 mb-4'>
          {[-2, -1, 0, 1, 2].map((offset) => {
            const monthDate = dayjs().add(offset, 'month')
            const isSelected = monthOffset === offset
            return (
              <Button
                key={offset}
                type='button'
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => setMonthOffset(offset)}
                className={cn({
                  'bg-green-500/50 text-white border-green-500/50 hover:bg-green-500/60 hover:text-white dark:bg-green-500/50 dark:text-white dark:border-green-500/50 dark:hover:bg-green-500/60':
                    isSelected,
                  'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-200/90 dark:text-gray-800 dark:border-gray-300 dark:hover:bg-gray-200 dark:hover:text-gray-800':
                    !isSelected
                })}
              >
                {monthDate.format('M月')}
              </Button>
            )
          })}
        </div>

        {/* スクロールエリア: ガントチャート */}
        <section
          ref={scrollContainerRef}
          aria-label='ガントチャートスクロールエリア'
          className={`gantt-scroll-container overflow-x-auto ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
          style={{
            scrollbarWidth: 'none', // Firefox
            msOverflowStyle: 'none' // IE/Edge
          }}
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div className='min-w-max'>
            {/* ヘッダー: 日付表示 */}
            <div className='flex h-6'>
              {dates.map((date) => {
                const isToday = date.isSame(today, 'day')
                const isSunday = date.day() === 0
                const isSaturday = date.day() === 6
                const isOutOfMonth = date.isAfter(actualMonthEnd)
                return (
                  <div
                    key={date.format('YYYY-MM-DD')}
                    className={`w-8 shrink-0 border-b flex items-center justify-center text-xs ${
                      isOutOfMonth
                        ? 'bg-gray-100 text-gray-300'
                        : isToday
                          ? 'bg-rose-50 font-bold text-rose-600'
                          : isSunday
                            ? 'text-rose-500'
                            : isSaturday
                              ? 'text-blue-500'
                              : 'text-gray-600'
                    }`}
                  >
                    {isOutOfMonth ? '' : date.format('D')}
                  </div>
                )
              })}
            </div>

            {/* イベント行 */}
            <div key={`gantt-${visibleEventBars.map((b) => b.event.id).join('-')}`}>
              <AnimatePresence mode='popLayout'>
                {visibleEventBars.map(({ event, startOffset, duration, status }) => {
                  const labelOffset = getLabelOffset(startOffset, duration)

                  return (
                    <motion.div
                      key={event.id}
                      layout
                      initial={{ opacity: 0, scaleY: 0, transformOrigin: 'top' }}
                      animate={{ opacity: 1, scaleY: 1, transformOrigin: 'top' }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 0.2,
                        ease: 'easeInOut'
                      }}
                      className='relative flex h-10'
                    >
                      {/* 背景グリッド */}
                      {dates.map((date) => {
                        const isToday = date.isSame(today, 'day')
                        const isOutOfMonth = date.isAfter(actualMonthEnd)
                        return (
                          <div
                            key={date.format('YYYY-MM-DD')}
                            className={`w-8 shrink-0 border-b ${isOutOfMonth ? 'bg-gray-50' : isToday ? 'bg-rose-50' : ''}`}
                          />
                        )
                      })}

                      {/* バー */}
                      {duration > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`absolute top-1 bottom-1 rounded overflow-hidden ${getCategoryColor(event.category, status)}`}
                              style={{
                                left: `${startOffset * 32}px`,
                                width: `${duration * 32 - 4}px`
                              }}
                            >
                              {/* ラベル（スクロール停止時に表示） */}
                              <div
                                className={`absolute inset-y-0 flex items-center gap-1.5 px-2 transition-opacity duration-150 ${isScrolling ? 'opacity-0' : 'opacity-100'}`}
                                style={{ transform: `translateX(${labelOffset}px)` }}
                              >
                                <span className='text-xs text-white font-medium truncate'>{event.name}</span>
                                {event.stores?.[0] && (
                                  <span className='text-xs text-white/70 shrink-0'>
                                    ({appContent.content.store_name[event.stores[0] as StoreKey] || event.stores[0]})
                                  </span>
                                )}
                                <ExternalLink className='size-3 text-white/70 shrink-0' />
                              </div>

                              {/* クリック領域 */}
                              <Link
                                to='/events/$eventId'
                                params={{ eventId: event.id }}
                                className='absolute inset-0 hover:bg-white/10 transition-colors'
                                onClick={(e) => {
                                  // ドラッグしていた場合はリンクを無効化
                                  if (hasDraggedRef.current) {
                                    e.preventDefault()
                                  }
                                }}
                                draggable={false}
                              >
                                <span className='sr-only'>{event.name}の詳細を見る</span>
                              </Link>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side='top' className='max-w-xs'>
                            <p className='font-medium'>{event.name}</p>
                            {event.stores && event.stores.length > 0 && (
                              <p className='text-xs text-gray-500'>
                                {event.stores
                                  .map((key) => appContent.content.store_name[key as StoreKey] || key)
                                  .join(', ')}
                              </p>
                            )}
                            <p className='text-xs text-gray-500'>
                              {dayjs(event.startDate).format('M/D')}
                              {event.endDate ? `〜${dayjs(event.endDate).format('M/D')}` : '〜なくなり次第終了'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>

            {/* イベントがない場合 */}
            {eventBars.length === 0 && (
              <div className='py-8 text-center text-gray-500'>表示するイベントがありません</div>
            )}
          </div>
        </section>
      </div>
    </TooltipProvider>
  )
}
