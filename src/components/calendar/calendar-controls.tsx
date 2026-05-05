import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { DURATION, EASE_OUT, FADE_IN_DOWN } from '@/lib/motion'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
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
      variants={FADE_IN_DOWN}
      initial='initial'
      animate='animate'
      transition={{ duration: DURATION.fast * 2, ease: EASE_OUT }}
      className='flex items-center justify-between'
    >
      <Button variant='ghost' size='icon' onClick={onPrevMonth} className='rounded-full border border-transparent'>
        <ChevronLeft className='h-5 w-5' />
      </Button>
      <button
        type='button'
        onClick={onCurrentMonth}
        className='text-2xl md:text-4xl font-bold tracking-tight text-center tabular-nums hover:text-primary transition-colors'
      >
        {year}年{month}月
      </button>
      <Button variant='ghost' size='icon' onClick={onNextMonth} className='rounded-full border border-transparent'>
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
    <div className='hidden md:flex gap-2 overflow-x-auto py-2 justify-center'>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
        const isSelected = selectedMonth === month
        return (
          <motion.div
            key={month}
            style={{ filter: STICKER_SHADOW_SM }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={STICKER_HOVER_TRANSITION}
          >
            <Button
              variant='secondary'
              onClick={() => onSelectMonth(month)}
              size='sm'
              className={cn(
                'shrink-0 rounded-full px-4 text-sm border',
                isSelected
                  ? 'bg-brand font-bold text-brand-foreground border-brand hover:bg-brand/90 hover:text-brand-foreground'
                  : 'bg-button-surface text-foreground border-card-border hover:bg-button-surface-hover'
              )}
            >
              {month}月
            </Button>
          </motion.div>
        )
      })}
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
