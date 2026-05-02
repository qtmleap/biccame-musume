import { GanttMonthSelector } from '@/components/events/gantt-chart-parts'

type GanttHeaderProps = {
  monthOffset: number
  onMonthSelect: (offset: number) => void
}

export const GanttHeader = ({ monthOffset, onMonthSelect }: GanttHeaderProps) => {
  return <GanttMonthSelector monthOffset={monthOffset} onSelect={onMonthSelect} />
}
