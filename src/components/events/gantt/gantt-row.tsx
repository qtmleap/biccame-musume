import { Link } from '@tanstack/react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { ExternalLink } from 'lucide-react'
import { GanttGridCell } from '@/components/events/gantt-chart-parts'
import { getCategoryColor } from '@/components/events/gantt-chart-utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import appContent, { EVENT_LABELS } from '@/locales/app.content'
import type { EventStatus } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'
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
    <div className='relative flex h-10'>
      {dates.map((date) => (
        <GanttGridCell key={date.format('YYYY-MM-DD')} date={date} today={today} actualMonthEnd={actualMonthEnd} />
      ))}

      {duration > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`absolute top-1 bottom-1 rounded overflow-hidden ${getCategoryColor(event.category, status as EventStatus)}`}
              style={{
                left: `${startOffset * 32}px`,
                width: `${duration * 32 - 4}px`
              }}
            >
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

              <Link
                to='/events/$uuid'
                params={{ uuid: event.uuid }}
                className='absolute inset-0 hover:bg-white/10 transition-colors'
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
            {event.stores && event.stores.length > 0 && (
              <p className='text-xs text-muted-foreground'>
                {event.stores.map((key) => appContent.content.store_name[key as StoreKey] || key).join(', ')}
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
