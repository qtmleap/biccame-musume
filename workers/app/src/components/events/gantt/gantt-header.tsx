import { GanttMonthSelector } from '@/components/events/gantt-chart-parts'
import { Button } from '@/components/ui/button'

type GanttHeaderProps = {
  monthOffset: number
  onMonthSelect: (offset: number) => void
  onToday: () => void
}

export const GanttHeader = ({ monthOffset, onMonthSelect, onToday }: GanttHeaderProps) => (
  <>
    <GanttMonthSelector monthOffset={monthOffset} onSelect={onMonthSelect} />
    <div className='flex flex-wrap items-center justify-between gap-2 mb-2'>
      <p id='gantt-scroll-hint' className='text-sm text-foreground'>
        左右にスクロールして日付を確認できます
      </p>
      <Button size='sm' variant='outline' onClick={onToday}>
        今日の位置へ
      </Button>
    </div>
  </>
)
