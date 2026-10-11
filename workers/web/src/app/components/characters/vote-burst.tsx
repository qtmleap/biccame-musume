import { Heart } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

type VoteBurstProps = {
  /// 同じ値が変わるたびにバーストを再生する
  triggerKey: number | null
  /// 浮かべるハートの数
  count?: number
}

/// 安定 key 用に固定の id を最大数ぶん事前に用意しておく
const hearts = Array.from({ length: 12 }, (_, i) => ({ id: `h-${i}` }))

/**
 * 投票成功時のハート fly-up エフェクト
 * 親要素は relative + overflow-visible 想定
 */
export const VoteBurst = ({ triggerKey, count = 5 }: VoteBurstProps) => {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (triggerKey === null) return
    setActive(true)
    const timeout = window.setTimeout(() => setActive(false), 900)
    return () => window.clearTimeout(timeout)
  }, [triggerKey])

  return (
    <AnimatePresence>
      {active && (
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
          {hearts.slice(0, count).map((heart, i) => {
            const offsetX = (i - (count - 1) / 2) * 14
            const delay = i * 0.04
            return (
              <motion.span
                key={`${triggerKey}-${heart.id}`}
                initial={{ opacity: 0, y: 0, x: offsetX, scale: 0.6 }}
                animate={{ opacity: [0, 1, 1, 0], y: -48 - i * 6, scale: [0.6, 1.1, 1, 0.9] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, delay, ease: 'easeOut' }}
                className='absolute text-favorite'
              >
                <Heart className='h-4 w-4 fill-current' />
              </motion.span>
            )
          })}
        </div>
      )}
    </AnimatePresence>
  )
}
