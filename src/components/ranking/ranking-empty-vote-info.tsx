import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { DURATION } from '@/lib/motion'

/**
 * 投票案内（票がまだ0件のときの空状態）
 */
export const RankingEmptyVoteInfo = () => (
  <motion.div
    className='text-center py-12'
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: DURATION.slow, ease: 'easeOut' }}
  >
    <motion.p
      className='text-muted-foreground text-base mb-2'
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, delay: 0.2 }}
    >
      まだ票が入ってないよ
    </motion.p>
    <motion.p
      className='text-muted-foreground text-sm mb-6'
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, delay: 0.3 }}
    >
      上のボタンで全員に投票するか、キャラ一覧から推しに投票しよ
    </motion.p>
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: DURATION.normal, delay: 0.4, type: 'spring', stiffness: 200 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Link
        to='/characters'
        className='inline-block px-4 py-2 bg-brand text-brand-foreground rounded-full hover:bg-brand/90 transition-colors text-sm font-medium shadow-lg hover:shadow-xl'
      >
        キャラクター一覧へ
      </Link>
    </motion.div>
  </motion.div>
)
