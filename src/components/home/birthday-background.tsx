import { motion } from 'motion/react'
import { useMemo } from 'react'
import type { StoreData } from '@/schemas/store.dto'

type BirthdayBackgroundProps = {
  characters: StoreData[]
}

/**
 * 誕生日画像のパスを取得
 */
const getBirthdayImagePath = (key: string): string => {
  return `/birth/${key}.webp`
}

/**
 * 背景表示版
 * 全ページの背景にキャラクターを薄く表示
 */
export const BirthdayBackground = ({ characters }: BirthdayBackgroundProps) => {
  // 紙吹雪の生成
  const confettiItems = useMemo(() => {
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff85a1', '#a855f7']
    return Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 5 + Math.random() * 5,
      color: colors[i % colors.length],
      rotation: Math.random() * 360,
      size: 4 + Math.random() * 6
    }))
  }, [])

  if (characters.length === 0) return null

  // 最初のキャラクターを背景に表示
  const character = characters[0]

  return (
    <div className='pointer-events-none fixed inset-0 z-0 overflow-hidden'>
      {/* キャラクター画像（右下に配置、透過） */}
      <motion.div
        className='absolute right-0 bottom-0 opacity-10'
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 0.1, x: 0 }}
        transition={{ duration: 1 }}
      >
        <img
          src={getBirthdayImagePath(character.id)}
          alt=''
          className='h-[60vh] w-auto object-contain'
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.src = character.character?.image_url || ''
          }}
        />
      </motion.div>

      {/* 左上にも小さく配置 */}
      <motion.div
        className='absolute top-20 left-0 opacity-5'
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 0.05, x: 0 }}
        transition={{ duration: 1, delay: 0.3 }}
      >
        <img
          src={getBirthdayImagePath(character.id)}
          alt=''
          className='h-[30vh] w-auto -scale-x-100 object-contain'
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.src = character.character?.image_url || ''
          }}
        />
      </motion.div>

      {/* 紙吹雪（非常に控えめ） */}
      <div className='absolute inset-0 overflow-hidden'>
        {confettiItems.map((item) => (
          <motion.div
            key={item.id}
            className='absolute top-0'
            style={{ left: `${item.x}%` }}
            initial={{ y: -20, opacity: 0 }}
            animate={{
              y: '100vh',
              opacity: [0, 0.3, 0.3, 0],
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

      {/* グラデーションオーバーレイ */}
      <div className='absolute inset-0 bg-linear-to-b from-transparent via-transparent to-pink-50/50' />
    </div>
  )
}
