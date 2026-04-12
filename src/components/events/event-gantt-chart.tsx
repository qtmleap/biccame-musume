import { TooltipProvider } from '@/components/ui/tooltip'
import type { Event } from '@/schemas/event.dto'
import { GanttHeader } from './gantt/gantt-header'
import { GanttTimeline } from './gantt/gantt-timeline'
import { useGanttLayout } from './gantt/use-gantt-layout'

type EventGanttChartProps = {
  events: Event[]
}

export const EventGanttChart = ({ events }: EventGanttChartProps) => {
  const layout = useGanttLayout(events)

  return (
    <TooltipProvider>
      <div className='relative'>
        <GanttHeader
          monthOffset={layout.monthOffset}
          onMonthSelect={layout.setMonthOffset}
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
          onTouchStart={layout.handleTouchStart}
          onTouchMove={layout.handleTouchMove}
          onTouchEnd={layout.handleTouchEnd}
          getLabelOffset={layout.getLabelOffset}
          hasDraggedRef={layout.hasDraggedRef}
        />
      </div>
    </TooltipProvider>
  )
}
