import dayjs, { type Dayjs } from 'dayjs'
import { ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AckeyCampaign } from '@/schemas/ackey-campaign.dto'

/**
 * カテゴリに応じた色を返す
 */
const getCategoryColor = (category: AckeyCampaign['category']) => {
  switch (category) {
    case 'limited_card':
      return 'bg-purple-500'
    case 'ackey':
      return 'bg-amber-500'
    case 'other':
    default:
      return 'bg-pink-500'
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

  // イベントのバー位置を計算
  const eventBars = useMemo(() => {
    return events.map((event) => {
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

      return {
        event,
        startOffset: Math.max(0, startOffset),
        duration: Math.min(duration, dates.length - Math.max(0, startOffset)),
        isOngoing: !event.endDate
      }
    })
  }, [events, chartStartDate, dates.length])

  const today = dayjs().startOf('day')
  const todayOffset = today.diff(chartStartDate, 'day')

  // スクロールコンテナのref
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // 初期表示時に今日の日付が左端に来るようにスクロール
  useEffect(() => {
    if (scrollContainerRef.current) {
      // 今日の位置までスクロール（w-8 = 32px）
      scrollContainerRef.current.scrollLeft = todayOffset * 32
    }
  }, [todayOffset])

  return (
    <TooltipProvider>
      <div ref={scrollContainerRef} className='overflow-x-auto'>
        <div className='min-w-max'>
          {/* ヘッダー: 月表示 */}
          <div className='flex'>
            {dates.map((date, index) => {
              const isFirstOfMonth = date.date() === 1 || index === 0
              const isToday = date.isSame(today, 'day')
              return (
                <div
                  key={date.format('YYYY-MM-DD')}
                  className={`w-8 shrink-0 border-b text-center text-xs ${isToday ? 'bg-rose-50' : ''}`}
                >
                  {isFirstOfMonth && (
                    <div className='font-medium text-gray-700'>{date.format('M月')}</div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ヘッダー: 日付表示 */}
          <div className='flex'>
            {dates.map((date) => {
              const isToday = date.isSame(today, 'day')
              const isSunday = date.day() === 0
              const isSaturday = date.day() === 6
              return (
                <div
                  key={date.format('YYYY-MM-DD')}
                  className={`w-8 shrink-0 border-b py-1 text-center text-xs ${
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
          {eventBars.map(({ event, startOffset, duration, isOngoing }) => (
            <div key={event.id} className='relative flex h-10'>
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

              {/* バー（イベント名を含む） */}
              {duration > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className='absolute top-1 bottom-1 flex items-center'
                      style={{
                        left: `${startOffset * 32}px`,
                        width: `${duration * 32 - 4}px`
                      }}
                    >
                      {event.referenceUrls?.[0]?.url ? (
                        <a
                          href={event.referenceUrls[0].url}
                          target='_blank'
                          rel='noopener noreferrer'
                          className={`h-full w-full rounded ${getCategoryColor(event.category)} hover:opacity-80 transition-opacity flex items-center gap-1 px-2 overflow-hidden`}
                        >
                          <span className='text-xs text-white truncate font-medium'>{event.name}</span>
                          <ExternalLink className='size-3 text-white shrink-0' />
                        </a>
                      ) : (
                        <div
                          className={`h-full w-full rounded ${getCategoryColor(event.category)} ${isOngoing ? 'opacity-70' : ''} flex items-center px-2 overflow-hidden`}
                        >
                          <span className='text-xs text-white truncate font-medium'>{event.name}</span>
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side='top' className='max-w-xs'>
                    <p className='font-medium'>{event.name}</p>
                    <p className='text-xs text-gray-500'>
                      {dayjs(event.startDate).format('M/D')}
                      {event.endDate ? `〜${dayjs(event.endDate).format('M/D')}` : '〜'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          ))}

          {/* イベントがない場合 */}
          {eventBars.length === 0 && (
            <div className='py-8 text-center text-gray-500'>
              表示するイベントがありません
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
