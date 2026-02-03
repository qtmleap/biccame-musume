import dayjs, { type Dayjs } from 'dayjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type MonthSelectorProps = {
  monthOffset: number
  onSelect: (offset: number) => void
}

/**
 * ガントチャートの月選択ボタン
 * 前後2ヶ月と今月の5つのボタンを表示
 */
export const GanttMonthSelector = ({ monthOffset, onSelect }: MonthSelectorProps) => {
  return (
    <div className='grid grid-cols-5 gap-2 mb-4'>
      {[-2, -1, 0, 1, 2].map((offset) => {
        const monthDate = dayjs().add(offset, 'month')
        const isSelected = monthOffset === offset
        return (
          <Button
            key={offset}
            variant='outline'
            size='sm'
            onClick={() => onSelect(offset)}
            className={cn({
              'bg-green-500/50 text-white border-green-500/50 hover:bg-green-500/60 hover:text-white dark:bg-green-500/50 dark:text-white dark:border-green-500/50 dark:hover:bg-green-500/60':
                isSelected,
              'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-200/90 dark:text-gray-800 dark:border-gray-300 dark:hover:bg-gray-200 dark:hover:text-gray-800':
                !isSelected
            })}
          >
            {monthDate.format('YY/MM')}
          </Button>
        )
      })}
    </div>
  )
}

type DateHeaderProps = {
  dates: Dayjs[]
  today: Dayjs
  actualMonthEnd: Dayjs
}

/**
 * ガントチャートの日付ヘッダー行
 */
export const GanttDateHeader = ({ dates, today, actualMonthEnd }: DateHeaderProps) => {
  return (
    <div className='flex h-6'>
      {dates.map((date) => {
        const isToday = date.isSame(today, 'day')
        const isSunday = date.day() === 0
        const isSaturday = date.day() === 6
        const isOutOfMonth = date.isAfter(actualMonthEnd)
        return (
          <div
            key={date.format('YYYY-MM-DD')}
            className={`w-8 shrink-0 border-b flex items-center justify-center text-xs ${
              isOutOfMonth
                ? 'bg-gray-100 text-gray-400'
                : isToday
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
  )
}

type DateGridCellProps = {
  date: Dayjs
  today: Dayjs
  actualMonthEnd: Dayjs
}

/**
 * イベント行の背景グリッドセル
 */
export const GanttGridCell = ({ date, today, actualMonthEnd }: DateGridCellProps) => {
  const isToday = date.isSame(today, 'day')
  const isOutOfMonth = date.isAfter(actualMonthEnd)
  return (
    <div
      key={date.format('YYYY-MM-DD')}
      className={`w-8 shrink-0 border-b ${isOutOfMonth ? 'bg-gray-50' : isToday ? 'bg-rose-50' : ''}`}
    />
  )
}
