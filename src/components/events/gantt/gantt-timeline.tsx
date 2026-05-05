import type { Dayjs } from 'dayjs'
import { useEffect, useRef } from 'react'
import { GanttRow } from '@/components/events/gantt/gantt-row'
import { GanttDateHeader } from '@/components/events/gantt-chart-parts'
import { hideScrollbarStyle } from '@/components/events/gantt-chart-utils'
import { GANTT_CHART_LABELS } from '@/locales/app.content'
import type { EventBar } from './use-gantt-layout'

type GanttTimelineProps = {
  eventBars: EventBar[]
  dates: Dayjs[]
  today: Dayjs
  actualMonthEnd: Dayjs
  monthOffset: number
  isScrolling: boolean
  isDragging: boolean
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
  onMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onMouseLeave: () => void
  getLabelOffset: (startOffset: number, duration: number) => number
  hasDraggedRef: React.MutableRefObject<boolean>
}

export const GanttTimeline = ({
  eventBars,
  dates,
  today,
  actualMonthEnd,
  monthOffset,
  isScrolling,
  isDragging,
  scrollContainerRef,
  onScroll,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  getLabelOffset,
  hasDraggedRef
}: GanttTimelineProps) => {
  const headerScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const body = scrollContainerRef.current
    const header = headerScrollRef.current
    if (!body || !header) return
    const syncBodyToHeader = () => {
      header.scrollLeft = body.scrollLeft
    }
    body.addEventListener('scroll', syncBodyToHeader, { passive: true })
    return () => body.removeEventListener('scroll', syncBodyToHeader)
  }, [scrollContainerRef])

  return (
    <>
      <style>{hideScrollbarStyle}</style>
      <div className='relative'>
        <div
          ref={headerScrollRef}
          aria-hidden='true'
          className='gantt-scroll-container sticky top-12 md:top-14 z-10 overflow-x-auto bg-page-bg'
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className='min-w-max'>
            <GanttDateHeader dates={dates} today={today} actualMonthEnd={actualMonthEnd} />
          </div>
        </div>
        <section
          ref={scrollContainerRef}
          aria-label={GANTT_CHART_LABELS.ariaLabel}
          className={`gantt-scroll-container overflow-x-auto ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            touchAction: 'pan-x pan-y'
          }}
          onScroll={onScroll}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        >
          <div className='min-w-max'>
            <div key={`gantt-${monthOffset}-${eventBars.map((b) => b.event.uuid).join('-')}`}>
              {eventBars.map((bar) => (
                <GanttRow
                  key={bar.event.uuid}
                  bar={bar}
                  dates={dates}
                  today={today}
                  actualMonthEnd={actualMonthEnd}
                  isScrolling={isScrolling}
                  labelOffset={getLabelOffset(bar.startOffset, bar.duration)}
                  hasDraggedRef={hasDraggedRef}
                />
              ))}
            </div>

            {eventBars.length === 0 && (
              <div className='py-8 text-center text-muted-foreground'>表示するイベントがありません</div>
            )}
          </div>
        </section>
        {/* モバイル: 右端フェードで横スクロール可能を示唆 */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent md:hidden'
        />
      </div>
    </>
  )
}
