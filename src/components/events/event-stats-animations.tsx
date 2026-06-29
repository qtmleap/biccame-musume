import { Award, Heart } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'

/**
 * ハートアニメーション用のパーティクル角度
 */
const HEART_PARTICLES = [0, 60, 120, 180, 240, 300] as const

/**
 * 花火アニメーション用のパーティクル角度とカラー
 */
const FIREWORK_PARTICLES = [
  { angle: 0, color: 'bg-action-award' },
  { angle: 30, color: 'bg-warning' },
  { angle: 60, color: 'bg-rank-gold' },
  { angle: 90, color: 'bg-action-award' },
  { angle: 120, color: 'bg-warning' },
  { angle: 150, color: 'bg-rank-gold' },
  { angle: 180, color: 'bg-action-award' },
  { angle: 210, color: 'bg-warning' },
  { angle: 240, color: 'bg-rank-gold' },
  { angle: 270, color: 'bg-action-award' },
  { angle: 300, color: 'bg-warning' },
  { angle: 330, color: 'bg-rank-gold' }
] as const

/**
 * お気に入り登録時に画面中央へ表示されるハートのアニメーション
 */
export const HeartBurstOverlay = ({ visible }: { visible: boolean }) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className='fixed inset-0 flex items-center justify-center pointer-events-none z-50'
      >
        {/* 背景のフラッシュ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.1, 0] }}
          transition={{ duration: DURATION.normal }}
          className='absolute inset-0 bg-action-interest-soft'
        />
        {/* 中央のハート */}
        <motion.div
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: [0, 1.2, 1], rotate: [-15, 10, 0] }}
          transition={{ duration: DURATION.normal, ease: 'easeOut' }}
        >
          <Heart className='h-24 w-24 fill-action-interest text-action-interest drop-shadow-lg' />
        </motion.div>
        {/* 放射状のハート */}
        {HEART_PARTICLES.map((angle) => (
          <motion.div
            key={`heart-center-${angle}`}
            initial={{ opacity: 1, scale: 0.5, x: 0, y: 0 }}
            animate={{
              opacity: [1, 1, 0],
              scale: [0.5, 1, 0.8],
              x: Math.cos((angle * Math.PI) / 180) * 120,
              y: Math.sin((angle * Math.PI) / 180) * 120
            }}
            transition={{ duration: DURATION.slow, ease: 'easeOut', delay: 0.1 }}
            className='absolute pointer-events-none'
          >
            <Heart className='h-8 w-8 fill-action-interest-soft text-action-interest-soft' />
          </motion.div>
        ))}
      </motion.div>
    )}
  </AnimatePresence>
)

/**
 * 達成報告時に画面中央へ表示される花火アニメーション
 */
export const FireworkBurstOverlay = ({ visible }: { visible: boolean }) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className='fixed inset-0 flex items-center justify-center pointer-events-none z-50'
      >
        {/* 背景のフラッシュ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.15, 0] }}
          transition={{ duration: DURATION.normal }}
          className='absolute inset-0 bg-action-award-soft'
        />
        {/* 中央のアワード */}
        <motion.div
          initial={{ scale: 0, y: 20 }}
          animate={{ scale: [0, 1.3, 1], y: [20, -10, 0] }}
          transition={{ duration: DURATION.normal, ease: 'easeOut' }}
        >
          <Award className='h-28 w-28 text-action-award fill-action-award-soft drop-shadow-lg' />
        </motion.div>
        {/* 花火パーティクル */}
        {FIREWORK_PARTICLES.map((particle) => (
          <motion.div
            key={`firework-center-${particle.angle}`}
            initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [1, 1, 0],
              scale: [0.5, 1.5, 1],
              x: Math.cos((particle.angle * Math.PI) / 180) * 150,
              y: Math.sin((particle.angle * Math.PI) / 180) * 150
            }}
            transition={{ duration: DURATION.slow, ease: 'easeOut', delay: 0.05 }}
            className='absolute pointer-events-none'
          >
            <div className={cn('w-4 h-4 rounded-full', particle.color)} />
          </motion.div>
        ))}
        {/* キラキラ追加 */}
        {HEART_PARTICLES.map((angle) => (
          <motion.div
            key={`sparkle-${angle}`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0.5],
              x: Math.cos(((angle + 30) * Math.PI) / 180) * 100,
              y: Math.sin(((angle + 30) * Math.PI) / 180) * 100
            }}
            transition={{ duration: DURATION.slow, ease: 'easeOut', delay: 0.15 }}
            className='absolute pointer-events-none'
          >
            <div className='w-2 h-2 bg-rank-gold rotate-45' />
          </motion.div>
        ))}
      </motion.div>
    )}
  </AnimatePresence>
)
