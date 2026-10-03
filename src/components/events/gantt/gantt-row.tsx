import { Link } from '@tanstack/react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { ExternalLink } from 'lucide-react'
import { GanttGridCell } from '@/components/events/gantt-chart-parts'
import { getCategoryColor } from '@/components/events/gantt-chart-utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import appContent, { EVENT_CATEGORY_LABELS, EVENT_LABELS, EVENT_STATUS_LABELS } from '@/locales/app.content'
import type { EventBar } from './use-gantt-layout'

type GanttRowProps = {
  bar: EventBar
  dates: Dayjs[]
  today: Dayjs
  actualMonthEnd: Dayjs
  isScrolling: boolean
  labelOffset: number
  hasDraggedRef: React.MutableRefObject<boolean>
}

export const GanttRow = ({
  bar,
  dates,
  today,
  actualMonthEnd,
  isScrolling,
  labelOffset,
  hasDraggedRef
}: GanttRowProps) => {
  const { event, startOffset, duration, status } = bar

  return (
    <div className='relative flex h-12'>
      {dates.map((date) => (
        <GanttGridCell key={date.format('YYYY-MM-DD')} date={date} today={today} actualMonthEnd={actualMonthEnd} />
      ))}

      {duration > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`absolute top-1 bottom-1 rounded-sm overflow-hidden ${getCategoryColor(event.category, status)}`}
              style={{
                left: `${startOffset * 32}px`,
                width: `${duration * 32 - 4}px`
              }}
            >
              <div
                className={`absolute inset-y-0 flex flex-col justify-center px-2 transition-opacity duration-150 ${isScrolling ? 'opacity-0' : 'opacity-100'}`}
                style={{ transform: `translateX(${labelOffset}px)` }}
              >
                <span className='text-sm font-medium whitespace-nowrap'>{event.title}</span>
                <span className='flex items-center gap-1.5 text-[13px] whitespace-nowrap'>
                  <span>
                    {EVENT_CATEGORY_LABELS[event.category]}
                    {status !== 'ongoing' && `・${EVENT_STATUS_LABELS[status]}`}
                  </span>
                  {event.stores?.[0] && (
                    <span>({appContent.content.store_name[event.stores[0]] || event.stores[0]})</span>
                  )}
                  <span>
                    {dayjs(event.startDate).format('M/D')}
                    {event.endDate ? `〜${dayjs(event.endDate).format('M/D')}` : EVENT_LABELS.untilStockLasts}
                  </span>
                  <ExternalLink className='size-3 shrink-0' aria-hidden />
                </span>
              </div>

              <Link
                to='/events/$uuid'
                params={{ uuid: event.uuid }}
                className='absolute inset-0 hover:outline hover:-outline-offset-1 hover:outline-[var(--gantt-foreground)]'
                onClick={(e) => {
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
            <p>
              {EVENT_CATEGORY_LABELS[event.category]}
              {status !== 'ongoing' && `・${EVENT_STATUS_LABELS[status]}`}
            </p>
            {event.stores && event.stores.length > 0 && (
              <p className='text-xs text-muted-foreground'>
                {event.stores.map((key) => appContent.content.store_name[key] || key).join(', ')}
              </p>
            )}
            <p className='text-xs text-muted-foreground'>
              {dayjs(event.startDate).format('M/D')}
              {event.endDate ? `〜${dayjs(event.endDate).format('M/D')}` : EVENT_LABELS.untilStockLasts}
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
