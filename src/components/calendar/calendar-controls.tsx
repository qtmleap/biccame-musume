import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
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
      className='flex items-center justify-between pb-2 md:pb-4'
    >
      <Button
        variant='ghost'
        size='icon'
        onClick={onPrevMonth}
        aria-label='前の月'
        className='rounded-full border border-transparent text-foreground'
      >
        <ChevronLeft className='h-5 w-5' />
      </Button>
      <button
        type='button'
        onClick={onCurrentMonth}
        className='text-foreground font-display text-2xl md:text-4xl font-bold tracking-tight text-center tabular-nums hover:text-primary transition-colors'
      >
        {year}年{month}月
      </button>
      <Button
        variant='ghost'
        size='icon'
        onClick={onNextMonth}
        aria-label='次の月'
        className='rounded-full border border-transparent text-foreground'
      >
        <ChevronRight className='h-5 w-5' />
      </Button>
    </motion.div>
  )
}

type CalendarMonthTabsProps = {
  selectedMonth: number
  onSelectMonth: (month: number) => void
}

/** 数字付き月選択。内容が収まるときだけ中央に配置し、狭い幅では左端からスクロールする。 */
const CalendarMonthSelector = ({
  selectedMonth,
  onSelectMonth,
  className
}: CalendarMonthTabsProps & { className: string }) => {
  const scrollerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const revealSelected = () => {
      const selected = scroller.querySelector<HTMLElement>(`[aria-label="${selectedMonth}月に移動"]`)
      if (!selected || scroller.clientWidth === 0) return
      const viewport = scroller.getBoundingClientRect()
      const target = selected.getBoundingClientRect()
      if (target.left < viewport.left) scroller.scrollLeft += target.left - viewport.left - 4
      else if (target.right > viewport.right) scroller.scrollLeft += target.right - viewport.right + 4
    }
    revealSelected()
    const observer = new ResizeObserver(revealSelected)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [selectedMonth])

  return (
    <div ref={scrollerRef} className={cn('overflow-x-auto py-3 md:py-4', className)}>
      <div className='flex w-max mx-auto gap-1.5 px-1'>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
          const isSelected = selectedMonth === month
          return (
            <motion.div
              key={month}
              className='shrink-0'
              style={{ filter: STICKER_SHADOW_SM }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={STICKER_HOVER_TRANSITION}
            >
              <Button
                variant='secondary'
                onClick={() => onSelectMonth(month)}
                aria-label={`${month}月に移動`}
                aria-pressed={isSelected}
                size='sm'
                className={cn(
                  'min-w-11 min-h-11 rounded-full px-3 text-sm border',
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
    </div>
  )
}

/** デスクトップ用の月選択。 */
export const CalendarMonthTabs = (props: CalendarMonthTabsProps) => (
  <CalendarMonthSelector {...props} className='hidden md:block' />
)

/** モバイル用の月選択。既存の呼び出し名を維持しつつ数字を表示する。 */
export const CalendarMonthDots = (props: CalendarMonthTabsProps) => (
  <CalendarMonthSelector {...props} className='md:hidden' />
)
