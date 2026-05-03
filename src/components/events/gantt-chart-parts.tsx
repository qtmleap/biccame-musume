import dayjs, { type Dayjs } from 'dayjs'
import { Button } from '@/components/ui/button'

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
          <Button key={offset} variant={isSelected ? 'default' : 'outline'} size='sm' onClick={() => onSelect(offset)}>
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
            className={`w-8 shrink-0 border-b border-gray-200 flex items-center justify-center text-xs ${
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
      className={`w-8 shrink-0 border-b border-gray-200 ${isOutOfMonth ? 'bg-gray-50' : isToday ? 'bg-rose-50' : ''}`}
    />
  )
}
