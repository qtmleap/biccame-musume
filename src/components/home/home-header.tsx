import { motion } from 'motion/react'
import { Suspense } from 'react'
import { PageViewCounter } from '@/components/common/page-view-counter'
import { DURATION, EASE_OUT, FADE_IN, FADE_IN_DOWN } from '@/lib/motion'

export const HomeHeader = () => {
  return (
    <header className='bg-linear-to-r from-[#e50012] to-[#ff3333] py-4 md:py-8'>
      <div className='container mx-auto px-4 text-center max-w-4xl'>
        <motion.h1
          variants={FADE_IN_DOWN}
          initial='initial'
          animate='animate'
          transition={{ duration: DURATION.slow * 0.75, ease: EASE_OUT }}
          className='text-xl md:text-2xl font-bold text-white mb-2 whitespace-nowrap'
        >
          <span className='hidden md:inline'>ビッカメ娘をもっと身近に、もっと楽しく</span>
          <span className='md:hidden'>
            ビッカメ娘を
            <br />
            もっと身近に、もっと楽しく
          </span>
        </motion.h1>
        <motion.p
          variants={FADE_IN}
          initial='initial'
          animate={{ opacity: 0.8 }}
          transition={{ duration: DURATION.slow * 0.75, delay: 0.3, ease: EASE_OUT }}
          className='text-white/80 text-xs md:text-sm mb-4'
        >
          推し活を全力サポート - イベント追跡から店舗巡りまで
        </motion.p>
        <motion.div
          variants={FADE_IN}
          initial='initial'
          animate='animate'
          transition={{ duration: DURATION.slow * 0.75, delay: 0.5, ease: EASE_OUT }}
        >
          <Suspense fallback={<div className='text-white/60 text-xs'>読み込み中...</div>}>
            <PageViewCounter className='text-white' />
          </Suspense>
        </motion.div>
      </div>
    </header>
  )
}
