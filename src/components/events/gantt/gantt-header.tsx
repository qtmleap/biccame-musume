import type { Dayjs } from 'dayjs'
import { GanttDateHeader, GanttMonthSelector } from '@/components/events/gantt-chart-parts'

type GanttHeaderProps = {
  dates: Dayjs[]
  today: Dayjs
  actualMonthEnd: Dayjs
  monthOffset: number
  onMonthSelect: (offset: number) => void
}

export const GanttHeader = ({ dates, today, actualMonthEnd, monthOffset, onMonthSelect }: GanttHeaderProps) => {
  return (
    <>
      <GanttMonthSelector monthOffset={monthOffset} onSelect={onMonthSelect} />
      <GanttDateHeader dates={dates} today={today} actualMonthEnd={actualMonthEnd} />
    </>
  )
}
