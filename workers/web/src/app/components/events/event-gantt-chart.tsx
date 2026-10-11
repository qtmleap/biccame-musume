import type { Event } from '@biccame/shared/schemas/event.dto'
import { GanttHeader } from '@/components/events/gantt/gantt-header'
import { GanttTimeline } from '@/components/events/gantt/gantt-timeline'
import { useGanttLayout } from '@/components/events/gantt/use-gantt-layout'
import { TooltipProvider } from '@/components/ui/tooltip'

type EventGanttChartProps = {
  events: Event[]
}

export const EventGanttChart = ({ events }: EventGanttChartProps) => {
  const layout = useGanttLayout(events)

  return (
    <TooltipProvider>
      <div className='relative min-w-0 max-w-full'>
        <GanttHeader
          monthOffset={layout.monthOffset}
          onMonthSelect={layout.setMonthOffset}
          onToday={() => {
            if (layout.monthOffset !== 0) layout.setMonthOffset(0)
            else layout.scrollContainerRef.current?.scrollTo({ left: layout.todayOffset * 32, behavior: 'auto' })
          }}
        />
        <GanttTimeline
          eventBars={layout.eventBars}
          dates={layout.dates}
          today={layout.today}
          actualMonthEnd={layout.actualMonthEnd}
          monthOffset={layout.monthOffset}
          isScrolling={layout.isScrolling}
          isDragging={layout.isDragging}
          scrollContainerRef={layout.scrollContainerRef}
          onScroll={layout.handleScroll}
          onMouseDown={layout.handleMouseDown}
          onMouseMove={layout.handleMouseMove}
          onMouseUp={layout.handleMouseUp}
          onMouseLeave={layout.handleMouseLeave}
          getLabelOffset={layout.getLabelOffset}
          hasDraggedRef={layout.hasDraggedRef}
        />
      </div>
    </TooltipProvider>
  )
}
