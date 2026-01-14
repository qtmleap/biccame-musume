import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { StoreData } from '@/schemas/store.dto'

type BirthdayFullscreenOverlayProps = {
  characters: StoreData[]
}

/**
 * 誕生日画像のパスを取得
 */
const getBirthdayImagePath = (characters: StoreData[]): string => {
  const key = characters.map(c => c.id).sort().join('_')
  return `/birth/${key}.webp`
}

/**
 * 紙吹雪コンポーネント
 */
const Confetti = ({ count = 50 }: { count?: number }) => {
  const confettiItems = useMemo(() => {
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
      {confettiItems.map((item) => (
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

/**
 * フルスクリーンオーバーレイ版
 * 背景透過で画面全体に表示、タップで閉じる
 */
export const BirthdayFullscreenOverlay = ({ characters }: BirthdayFullscreenOverlayProps) => {
  const [open, setOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [imageError, setImageError] = useState(false)

  const sessionKey = `birthday-shown-${dayjs().format('YYYY-MM-DD')}`

  useEffect(() => {
    if (characters.length === 0) return

    if (!import.meta.env.DEV) {
      const alreadyShown = sessionStorage.getItem(sessionKey)
      if (alreadyShown) return
    }

    const timer = setTimeout(() => {
      setOpen(true)
      if (!import.meta.env.DEV) {
        sessionStorage.setItem(sessionKey, 'true')
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [characters.length, sessionKey])

  if (characters.length === 0) return null

  const currentCharacter = characters[currentIndex]

  const handleClose = () => {
    if (currentIndex < characters.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setImageError(false)
    } else {
      setOpen(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className='fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={handleClose}
        >
          {/* 背景グラデーション（透過） */}
          <motion.div
            className='absolute inset-0 bg-linear-to-b from-pink-500/30 via-purple-500/20 to-transparent backdrop-blur-sm'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />

          {/* 紙吹雪 */}
          <Confetti count={60} />

          {/* キャラクター画像 */}
          <motion.div
            key={currentCharacter.id}
            className='relative z-10 flex max-h-[60vh] max-w-[80vw] items-center justify-center'
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -50 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {!imageError ? (
              <motion.img
                src={getBirthdayImagePath(characters)}
                alt={`${currentCharacter.character?.name}の誕生日`}
                className='max-h-[60vh] max-w-full object-contain drop-shadow-2xl'
                onError={() => setImageError(true)}
                animate={{ y: [0, -10, 0] }}
                transition={{
                  duration: 3,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut'
                }}
              />
            ) : (
              <motion.img
                src={currentCharacter.character?.image_url}
                alt={currentCharacter.character?.name}
                className='max-h-[50vh] max-w-[70vw] object-contain drop-shadow-2xl'
                animate={{ y: [0, -10, 0] }}
                transition={{
                  duration: 3,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut'
                }}
              />
            )}
          </motion.div>

          {/* テキスト */}
          <motion.div
            className='relative z-10 mt-8 text-center'
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <motion.h2
              className='text-4xl font-bold text-white drop-shadow-lg md:text-5xl'
              animate={{ scale: [1, 1.05, 1] }}
              transition={{
                duration: 2,
                repeat: Number.POSITIVE_INFINITY,
                ease: 'easeInOut'
              }}
            >
              Happy Birthday!
            </motion.h2>
            <p className='mt-2 text-xl text-white drop-shadow-md md:text-2xl'>{currentCharacter.character?.name}</p>
            <p className='mt-1 text-sm text-white/80 drop-shadow-md'>{currentCharacter.store?.name}</p>

            {/* 詳細リンク */}
            <Link
              to='/characters'
              search={{ character: currentCharacter.id }}
              className='mt-4 inline-block rounded-full bg-white/20 px-6 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30'
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
              }}
            >
              詳細を見る
            </Link>

            {/* 閉じるヒント */}
            <p className='mt-6 text-xs text-white/60'>
              {characters.length > 1 ? `タップして次へ (${currentIndex + 1}/${characters.length})` : 'タップして閉じる'}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
