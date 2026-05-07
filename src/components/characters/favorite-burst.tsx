import { Heart, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

type FavoriteBurstProps = {
  /// 同じ値が変わるたびにバーストを再生する
  triggerKey: number | null
}

const SPARKLE_COUNT = 14

/**
 * お気に入り登録成功時の画面中央バースト
 * 大きなハートと放射状のスパークルがふわっと出て消える
 */
export const FavoriteBurst = ({ triggerKey }: FavoriteBurstProps) => {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (triggerKey === null) return
    setActive(true)
    const timeout = window.setTimeout(() => setActive(false), 1100)
    return () => window.clearTimeout(timeout)
  }, [triggerKey])

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={triggerKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className='pointer-events-none fixed inset-0 z-50 flex items-center justify-center'
          aria-hidden
        >
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.25, 1.05, 0.95], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.0, ease: 'easeOut', times: [0, 0.3, 0.6, 1] }}
            className='absolute text-favorite drop-shadow-[0_4px_24px_rgb(244_63_94_/_0.45)]'
          >
            <Heart className='h-32 w-32 fill-favorite/70' strokeWidth={1.5} />
          </motion.span>

          {Array.from({ length: SPARKLE_COUNT }).map((_, i) => {
            const angle = (i / SPARKLE_COUNT) * Math.PI * 2
            const distance = 110 + (i % 3) * 32
            const x = Math.cos(angle) * distance
            const y = Math.sin(angle) * distance
            const angleDeg = Math.round(angle * (180 / Math.PI))
            return (
              <motion.span
                key={`${triggerKey}-sparkle-${angleDeg}`}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.3, rotate: 0 }}
                animate={{
                  x,
                  y,
                  opacity: [0, 1, 0],
                  scale: [0.3, 1.0, 0.6],
                  rotate: 90
                }}
                transition={{ duration: 0.95, delay: 0.05 + (i % 4) * 0.03, ease: 'easeOut' }}
                className='absolute text-favorite'
              >
                <Sparkles className='h-5 w-5 fill-favorite/50' />
              </motion.span>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
