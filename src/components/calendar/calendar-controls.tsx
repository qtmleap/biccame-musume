import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CalendarHeaderProps = {
  year: number
  month: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onCurrentMonth: () => void
}

/**
 * カレンダーヘッダー（年月表示と前後ボタン）
 */
export const CalendarHeader = ({ year, month, onPrevMonth, onNextMonth, onCurrentMonth }: CalendarHeaderProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className='flex items-center justify-between'
    >
      <Button variant='ghost' size='icon' onClick={onPrevMonth} className='rounded-full'>
        <ChevronLeft className='h-5 w-5' />
      </Button>
      <button
        type='button'
        onClick={onCurrentMonth}
        className='text-2xl md:text-4xl font-bold tracking-tight text-center tabular-nums hover:text-primary transition-colors'
      >
        {year}年{month}月
      </button>
      <Button variant='ghost' size='icon' onClick={onNextMonth} className='rounded-full'>
        <ChevronRight className='h-5 w-5' />
      </Button>
    </motion.div>
  )
}

type CalendarMonthTabsProps = {
  selectedMonth: number
  onSelectMonth: (month: number) => void
}

/**
 * カレンダー月選択タブ（デスクトップ用）
 */
export const CalendarMonthTabs = ({ selectedMonth, onSelectMonth }: CalendarMonthTabsProps) => {
  return (
    <div className='hidden md:flex gap-1 overflow-x-auto pb-2 justify-center'>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
        <Button
          key={month}
          variant='ghost'
          onClick={() => onSelectMonth(month)}
          size='sm'
          className={cn(
            'shrink-0 rounded-full px-4 transition-all',
            selectedMonth === month
              ? 'bg-muted font-semibold text-foreground'
              : 'hover:bg-muted/50 text-muted-foreground'
          )}
        >
          {month}月
        </Button>
      ))}
    </div>
  )
}

type CalendarMonthDotsProps = {
  selectedMonth: number
  onSelectMonth: (month: number) => void
}

/**
 * カレンダー月選択ドット（モバイル用）
 */
export const CalendarMonthDots = ({ selectedMonth, onSelectMonth }: CalendarMonthDotsProps) => {
  return (
    <div className='flex justify-center gap-1.5 md:hidden'>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
        <button
          key={month}
          type='button'
          onClick={() => onSelectMonth(month)}
          className={`w-2.5 h-2.5 rounded-full transition-all ${
            selectedMonth === month ? 'bg-primary scale-125' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
          }`}
          aria-label={`${month}月に移動`}
        />
      ))}
    </div>
  )
}
