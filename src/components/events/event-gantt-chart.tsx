import { Link } from '@tanstack/react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GanttDateHeader, GanttGridCell, GanttMonthSelector } from '@/components/events/gantt-chart-parts'
import { getCategoryColor, hideScrollbarStyle } from '@/components/events/gantt-chart-utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import appContent, { EVENT_LABELS } from '@/locales/app.content'
import type { Event, EventStatus } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * 日付範囲を生成
 */
// @ts-expect-error 将来の使用のために残している
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
  const { dates, chartStartDate, chartEndDate, actualMonthEnd } = useMemo(() => {
    const today = dayjs().startOf('day')
    // 指定月の1日から表示開始
    const chartStart = today.add(monthOffset, 'month').startOf('month')
    // 実際の月の最終日
    const monthEnd = chartStart.endOf('month')
    // 1ヶ月+1週間分(38日)生成
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

  // カテゴリの優先順位
  const categoryOrder: Record<Event['category'], number> = {
    limited_card: 0,
    regular_card: 1,
    ackey: 2,
    other: 3
  }

  const today = dayjs().startOf('day')
  const todayOffset = today.diff(chartStartDate, 'day')

  // イベントのバー位置を計算（開始日→カテゴリ順でソート）
  const eventBars = useMemo(() => {
    // 表示期間の日数（38日）
    const displayDays = 38

    // regular_card（通常名刺）の重複を排除
    // 通常名刺は店舗ごとに1つだけ表示
    const deduplicatedEvents = (() => {
      const regularCardStores = new Set<string>()
      return events.filter((event) => {
        if (event.category !== 'regular_card') {
          return true
        }
        // 店舗ごとに1つだけ表示
        const stores = event.stores || []
        for (const store of stores) {
          if (regularCardStores.has(store)) {
            return false // 既にこの店舗の通常名刺がある
          }
          regularCardStores.add(store)
        }
        // 店舗がない場合はタイトルで判定
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

    // まずイベントをソート: 開始日 → カテゴリ順
    const sortedEvents = [...deduplicatedEvents].sort((a, b) => {
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

        // 終了日がチャート開始日より前、または開始日がチャート終了日より後なら表示しない
        if (eventEnd.isBefore(chartStartDate) || eventStart.isAfter(chartEndDate)) {
          return null
        }

        // チャート開始より前に始まったイベントは、その分durationを短くする
        // また、表示期間(38日)を超えないように制限
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
      .filter((bar) => bar !== null)
  }, [events, chartStartDate, chartEndDate])

  const visibleEventBars = eventBars

  // デバッグ用
  console.log('Month offset:', monthOffset, 'Visible events:', visibleEventBars.length)

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
        <GanttMonthSelector monthOffset={monthOffset} onSelect={setMonthOffset} />

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
            <GanttDateHeader dates={dates} today={today} actualMonthEnd={actualMonthEnd} />

            {/* イベント行 */}
            <div key={`gantt-${monthOffset}-${visibleEventBars.map((b) => b.event.uuid).join('-')}`}>
              {visibleEventBars.map(({ event, startOffset, duration, status }) => {
                const labelOffset = getLabelOffset(startOffset, duration)

                return (
                  <div key={event.uuid} className='relative flex h-10'>
                    {/* 背景グリッド */}
                    {dates.map((date) => (
                      <GanttGridCell
                        key={date.format('YYYY-MM-DD')}
                        date={date}
                        today={today}
                        actualMonthEnd={actualMonthEnd}
                      />
                    ))}

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
                              <span className='text-xs text-white font-medium truncate'>{event.title}</span>
                              {event.stores?.[0] && (
                                <span className='text-xs text-white/70 shrink-0'>
                                  ({appContent.content.store_name[event.stores[0] as StoreKey] || event.stores[0]})
                                </span>
                              )}
                              <ExternalLink className='size-3 text-white/70 shrink-0' />
                            </div>

                            {/* クリック領域 */}
                            <Link
                              to='/events/$uuid'
                              params={{ uuid: event.uuid }}
                              className='absolute inset-0 hover:bg-white/10 transition-colors'
                              onClick={(e) => {
                                // ドラッグしていた場合はリンクを無効化
                                if (hasDraggedRef.current) {
                                  e.preventDefault()
                                }
                              }}
                              draggable={false}
                            >
                              <span className='sr-only'>{event.title}の詳細を見る</span>
                            </Link>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side='top' className='max-w-xs'>
                          <p className='font-medium'>{event.title}</p>
                          {event.stores && event.stores.length > 0 && (
                            <p className='text-xs text-gray-500'>
                              {event.stores
                                .map((key) => appContent.content.store_name[key as StoreKey] || key)
                                .join(', ')}
                            </p>
                          )}
                          <p className='text-xs text-gray-500'>
                            {dayjs(event.startDate).format('M/D')}
                            {event.endDate ? `〜${dayjs(event.endDate).format('M/D')}` : EVENT_LABELS.untilStockLasts}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )
              })}
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
