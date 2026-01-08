import { Link } from '@tanstack/react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { ExternalLink } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AckeyCampaign } from '@/schemas/ackey-campaign.dto'

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
const getCategoryColor = (category: AckeyCampaign['category'], isEnded: boolean) => {
  if (isEnded) {
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
const generateDateRange = (startDate: Dayjs, endDate: Dayjs): Dayjs[] => {
  const dates: Dayjs[] = []
  let current = startDate
  while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
    dates.push(current)
    current = current.add(1, 'day')
  }
  return dates
}

type EventGanttChartProps = {
  events: AckeyCampaign[]
}

/**
 * カスタムガントチャートコンポーネント
 */
export const EventGanttChart = ({ events }: EventGanttChartProps) => {
  // 終了したイベントを表示するかどうか
  const [showEnded, setShowEnded] = useState(false)

  // 表示する日付範囲を計算（今日から30日後まで）
  const { dates, chartStartDate } = useMemo(() => {
    const today = dayjs().startOf('day')
    const chartStart = today.subtract(7, 'day')
    const chartEnd = today.add(30, 'day')
    return {
      dates: generateDateRange(chartStart, chartEnd),
      chartStartDate: chartStart
    }
  }, [])

  // カテゴリの優先順位
  const categoryOrder: Record<AckeyCampaign['category'], number> = {
    limited_card: 0,
    regular_card: 1,
    ackey: 2,
    other: 3
  }

  const today = dayjs().startOf('day')
  const todayOffset = today.diff(chartStartDate, 'day')

  // イベントのバー位置を計算（開始日→カテゴリ順でソート）
  const eventBars = useMemo(() => {
    // まずイベントをソート: 開始日 → カテゴリ順
    const sortedEvents = [...events].sort((a, b) => {
      const startDiff = dayjs(a.startDate).diff(dayjs(b.startDate))
      if (startDiff !== 0) return startDiff
      return categoryOrder[a.category] - categoryOrder[b.category]
    })

    return sortedEvents.map((event) => {
      const eventStart = dayjs(event.startDate).startOf('day')
      // 終了日がない場合は月末か開始日から14日後のどちらか長い方
      let eventEnd: Dayjs
      if (event.endDate) {
        eventEnd = dayjs(event.endDate).startOf('day')
      } else {
        const endOfMonth = eventStart.endOf('month').startOf('day')
        const plus14Days = eventStart.add(14, 'day')
        eventEnd = endOfMonth.isAfter(plus14Days) ? endOfMonth : plus14Days
      }

      const startOffset = eventStart.diff(chartStartDate, 'day')
      const duration = eventEnd.diff(eventStart, 'day') + 1

      // イベントが終了しているかどうかを判定
      // 1. actualEndDateがある
      // 2. endDateを過ぎている
      // 3. 終了URLが入力されている
      // 4. isEndedフラグがtrue
      const now = dayjs()
      const hasEndUrl = event.referenceUrls?.some((ref) => ref.type === 'end') ?? false
      const isPastEndDate = event.endDate ? now.isAfter(dayjs(event.endDate)) : false
      const isEnded = event.actualEndDate ? true : isPastEndDate || hasEndUrl || event.isEnded

      return {
        event,
        startOffset: Math.max(0, startOffset),
        duration: Math.min(duration, dates.length - Math.max(0, startOffset)),
        isOngoing: !event.endDate,
        isEnded
      }
    })
  }, [events, chartStartDate, dates.length])

  // 終了イベントのフィルタリング
  const filteredEventBars = useMemo(() => {
    if (showEnded) return eventBars
    return eventBars.filter((bar) => !bar.isEnded)
  }, [eventBars, showEnded])

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

  // 初期表示時に今日の日付が左端に来るようにスクロール
  useEffect(() => {
    if (scrollContainerRef.current) {
      // 今日の位置までスクロール（w-8 = 32px）
      scrollContainerRef.current.scrollLeft = todayOffset * 32
      setScrollLeft(todayOffset * 32)
      // 初回スクロール後にフラグをクリア
      requestAnimationFrame(() => {
        isInitialMountRef.current = false
      })
    }
  }, [todayOffset])

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

  // 現在表示されている月を計算
  const currentVisibleMonth = useMemo(() => {
    const dayIndex = Math.floor(scrollLeft / 32)
    if (dayIndex >= 0 && dayIndex < dates.length) {
      return dates[dayIndex].format('M月')
    }
    return dates[0]?.format('M月') ?? ''
  }, [scrollLeft, dates])

  return (
    <TooltipProvider>
      {/* Chrome/Safari用スクロールバー非表示スタイル */}
      <style>{hideScrollbarStyle}</style>
      <div className='relative'>
        {/* ヘッダー: 月表示とフィルタ */}
        <div className='flex items-center justify-between mb-2'>
          <div className='h-5 px-1 flex items-center text-xs font-medium text-gray-700'>
            {currentVisibleMonth}
          </div>
          <div className='flex items-center gap-2'>
            <Checkbox
              id='show-ended'
              checked={showEnded}
              onCheckedChange={(checked) => setShowEnded(checked === true)}
              className='border-gray-400 data-[state=checked]:bg-gray-400 data-[state=checked]:border-gray-400'
            />
            <Label htmlFor='show-ended' className='text-xs text-gray-600 cursor-pointer'>
              終了したイベントを表示
            </Label>
          </div>
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
            {/* ヘッダー: 月表示（背景用） */}
            <div className='flex h-5'>
              {dates.map((date) => {
                const isToday = date.isSame(today, 'day')
                return (
                  <div
                    key={date.format('YYYY-MM-DD')}
                    className={`w-8 shrink-0 border-b ${isToday ? 'bg-rose-50' : ''}`}
                  />
                )
              })}
            </div>

            {/* ヘッダー: 日付表示 */}
            <div className='flex h-6'>
              {dates.map((date) => {
                const isToday = date.isSame(today, 'day')
                const isSunday = date.day() === 0
                const isSaturday = date.day() === 6
                return (
                  <div
                    key={date.format('YYYY-MM-DD')}
                    className={`w-8 shrink-0 border-b flex items-center justify-center text-xs ${
                      isToday
                        ? 'bg-rose-50 font-bold text-rose-600'
                        : isSunday
                          ? 'text-rose-500'
                          : isSaturday
                            ? 'text-blue-500'
                            : 'text-gray-600'
                    }`}
                  >
                    {date.format('D')}
                  </div>
                )
              })}
            </div>

            {/* イベント行 */}
            <AnimatePresence mode='popLayout'>
              {filteredEventBars.map(({ event, startOffset, duration, isOngoing, isEnded }) => {
                const labelOffset = getLabelOffset(startOffset, duration)

                return (
                  <motion.div
                    key={event.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 40 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className='relative flex'
                  >
                    {/* 背景グリッド */}
                    {dates.map((date) => {
                      const isToday = date.isSame(today, 'day')
                      return (
                        <div
                          key={date.format('YYYY-MM-DD')}
                          className={`w-8 shrink-0 border-b ${isToday ? 'bg-rose-50' : ''}`}
                        />
                      )
                    })}

                  {/* バー */}
                  {duration > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`absolute top-1 bottom-1 rounded overflow-hidden ${getCategoryColor(event.category, isEnded)} ${isOngoing ? 'opacity-70' : ''}`}
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
                              <span className='text-xs text-white/70 shrink-0'>({event.stores[0]})</span>
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
                          <p className='text-xs text-gray-500'>{event.stores.join(', ')}</p>
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
