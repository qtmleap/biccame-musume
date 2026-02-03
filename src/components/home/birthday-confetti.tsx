import { motion } from 'motion/react'
import { useMemo } from 'react'

type ConfettiProps = {
  count?: number
}

/**
 * 紙吹雪アニメーションコンポーネント
 * 誕生日表示などのお祝い演出に使用
 */
export const Confetti = ({ count = 50 }: ConfettiProps) => {
  const items = useMemo(() => {
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff85a1', '#a855f7']
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 3 + Math.random() * 3,
      color: colors[i % colors.length],
      rotation: Math.random() * 360,
      size: 4 + Math.random() * 8
    }))
  }, [count])

  return (
    <div className='pointer-events-none absolute inset-0 overflow-hidden'>
      {items.map((item) => (
        <motion.div
          key={item.id}
          className='absolute top-0'
          style={{ left: `${item.x}%` }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{
            y: '100vh',
            opacity: [1, 1, 0],
            rotate: item.rotation
          }}
          transition={{
            duration: item.duration,
            delay: item.delay,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear'
          }}
        >
          <div
            className='rounded-full'
            style={{
              backgroundColor: item.color,
              width: item.size,
              height: item.size
            }}
          />
        </motion.div>
      ))}
    </div>
  )
}
