import { motion } from 'motion/react'
import { usePageViews } from '@/hooks/use-page-views'

type PageViewCounterProps = {
  className?: string
  path?: string
}

/**
 * ページビューカウンター
 * 今日と合計のアクセス数を並べて表示
 * 5秒ごとに自動更新され、数値が変わるとアニメーション表示
 */
export const PageViewCounter = ({ className, path }: PageViewCounterProps) => {
  const { data } = usePageViews(path)

  return (
    <div className={`flex items-center justify-center gap-6 ${className || ''}`}>
      {/* 今日のアクセス数 */}
      <div className='flex flex-col'>
        <span className='text-xs text-white/60'>本日</span>
        <motion.span
          key={data.today}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className='text-lg font-bold text-white tabular-nums'
        >
          {data.today.toLocaleString()}
        </motion.span>
      </div>

      {/* 区切り線 */}
      <div className='h-10 w-px bg-white/30' />

      {/* 合計アクセス数 */}
      <div className='flex flex-col'>
        <span className='text-xs text-white/60'>合計</span>
        <motion.span
          key={data.total}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className='text-lg font-bold text-white tabular-nums'
        >
          {data.total.toLocaleString()}
        </motion.span>
      </div>
    </div>
  )
}
