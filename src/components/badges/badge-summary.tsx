import { motion } from 'motion/react'
import { DURATION } from '@/lib/motion'

type BadgeSummaryProps = {
  earnedCount: number
}

/**
 * 獲得バッジ数だけを大きく見せる自己満足サマリー
 */
export const BadgeSummary = ({ earnedCount }: BadgeSummaryProps) => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal }}
      className='relative bg-card border border-card-border rounded-3xl py-6 md:py-8 px-4 overflow-hidden text-center'
    >
      <div aria-hidden className='absolute -top-3 left-6 w-16 h-5 bg-rank-gold/70 -rotate-6 rounded-sm' />
      <div
        aria-hidden
        className='absolute -top-2 right-8 w-10 h-4 bg-action-interest-soft/80 rotate-[5deg] rounded-sm'
      />

      <p className='text-xs md:text-sm text-muted-foreground tracking-wide'>獲得バッジ</p>
      <div
        className='font-numeric font-black tabular-nums text-rank-gold leading-none mt-1 text-5xl md:text-6xl'
        style={{ letterSpacing: '-0.06em' }}
      >
        {earnedCount}
        <span className='ml-1 text-xl md:text-2xl text-muted-foreground'>個</span>
      </div>
    </motion.section>
  )
}
