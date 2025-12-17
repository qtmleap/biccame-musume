import { motion } from 'motion/react'

/**
 * ホームページヘッダー
 */
export const HomeHeader = () => {
  return (
    <header className='bg-linear-to-r from-[#e50012] to-[#ff3333] py-10 md:py-12'>
      <div className='container mx-auto px-4 text-center max-w-4xl'>
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className='text-xl md:text-2xl font-bold text-white mb-2 whitespace-nowrap'
        >
          <span className='hidden md:inline'>イベントを逃さない。全国を回りやすく。</span>
          <span className='md:hidden'>
            イベントを逃さない。
            <br />
            全国を回りやすく。
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
          className='text-white/80 text-xs md:text-sm'
        >
          ビッカメ娘のイベント追跡と店舗巡り支援サイト
        </motion.p>
      </div>
    </header>
  )
}
