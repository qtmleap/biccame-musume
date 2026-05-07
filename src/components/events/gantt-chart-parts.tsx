import dayjs, { type Dayjs } from 'dayjs'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
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
    <div className='grid grid-cols-5 gap-1 md:gap-2 mb-4 py-1'>
      {[-2, -1, 0, 1, 2].map((offset) => {
        const monthDate = dayjs().add(offset, 'month')
        const isSelected = monthOffset === offset
        return (
          <motion.div
            key={offset}
            className='w-full'
            style={{ filter: STICKER_SHADOW_SM }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={STICKER_HOVER_TRANSITION}
          >
            <Button
              variant='secondary'
              size='sm'
              onClick={() => onSelect(offset)}
              className={cn(
                'w-full text-xs md:text-sm px-2 md:px-3 rounded-full border',
                isSelected
                  ? 'bg-brand text-brand-foreground border-brand hover:bg-brand/90'
                  : 'bg-button-surface text-foreground border-card-border hover:bg-button-surface-hover'
              )}
            >
              {monthDate.format('YY/MM')}
            </Button>
          </motion.div>
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
            className={`w-8 shrink-0 border-r border-card-border last:border-r-0 flex items-center justify-center text-xs font-semibold ${
              isOutOfMonth
                ? 'bg-muted text-muted-foreground'
                : isToday
                  ? 'bg-calendar-today/50 font-bold text-calendar-sunday'
                  : isSunday
                    ? 'text-calendar-sunday'
                    : isSaturday
                      ? 'text-calendar-saturday'
                      : 'text-muted-foreground'
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
      className={`w-8 shrink-0 border-r border-card-border last:border-r-0 ${isOutOfMonth ? 'bg-muted/50' : isToday ? 'bg-calendar-today/30' : ''}`}
    />
  )
}
