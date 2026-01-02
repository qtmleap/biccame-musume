import { Link } from '@tanstack/react-router'
import { Cake, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Character } from '@/schemas/character.dto'

type BirthdayFloatingCardProps = {
  characters: Character[]
}

/**
 * フローティングカード版
 * 画面端に浮遊するカード形式、ドラッグで移動可能
 */
export const BirthdayFloatingCard = ({ characters }: BirthdayFloatingCardProps) => {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  const sessionKey = `birthday-floating-shown-${new Date().toISOString().split('T')[0]}`

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

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + characters.length) % characters.length)
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % characters.length)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className='fixed right-4 bottom-4 z-50'
          initial={{ opacity: 0, scale: 0.8, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 100 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          drag
          dragConstraints={{ left: -300, right: 0, top: -500, bottom: 0 }}
          dragElastic={0.1}
        >
          {minimized ? (
            // 最小化状態
            <motion.button
              type='button'
              className='flex items-center gap-2 rounded-full bg-linear-to-r from-pink-500 to-purple-500 p-3 shadow-xl'
              onClick={() => setMinimized(false)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <Avatar className='size-8 border-2 border-white/50'>
                <AvatarImage src={currentCharacter.profile_image_url} alt={currentCharacter.character_name} />
                <AvatarFallback>{currentCharacter.character_name.charAt(0)}</AvatarFallback>
              </Avatar>
              <Cake className='size-5 text-white' />
            </motion.button>
          ) : (
            // 展開状態
            <motion.div className='w-72 overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800' layout>
              {/* ヘッダー */}
              <div className='flex items-center justify-between bg-linear-to-r from-pink-500 to-purple-500 p-3'>
                <div className='flex items-center gap-2'>
                  <Cake className='size-4 text-white' />
                  <span className='text-sm font-medium text-white'>Today's Birthday</span>
                </div>
                <div className='flex items-center gap-1'>
                  <button
                    type='button'
                    onClick={() => setMinimized(true)}
                    className='rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white'
                  >
                    <ChevronRight className='size-4' />
                  </button>
                  <button
                    type='button'
                    onClick={() => setOpen(false)}
                    className='rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white'
                  >
                    <X className='size-4' />
                  </button>
                </div>
              </div>

              {/* コンテンツ */}
              <div className='p-4'>
                <AnimatePresence mode='wait'>
                  <motion.div
                    key={currentCharacter.key}
                    className='flex items-center gap-4'
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Avatar className='size-16 border-2 border-pink-200'>
                      <AvatarImage src={currentCharacter.profile_image_url} alt={currentCharacter.character_name} />
                      <AvatarFallback>{currentCharacter.character_name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className='flex-1'>
                      <motion.p
                        className='bg-linear-to-r from-pink-500 to-purple-500 bg-clip-text text-lg font-bold text-transparent'
                        animate={{ scale: [1, 1.02, 1] }}
                        transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                      >
                        Happy Birthday!
                      </motion.p>
                      <p className='font-medium text-gray-800 dark:text-gray-200'>{currentCharacter.character_name}</p>
                      <p className='text-xs text-gray-500 dark:text-gray-400'>{currentCharacter.store_name}</p>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* ナビゲーション */}
                {characters.length > 1 && (
                  <div className='mt-3 flex items-center justify-between'>
                    <button
                      type='button'
                      onClick={handlePrevious}
                      className='rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700'
                    >
                      <ChevronLeft className='size-5' />
                    </button>
                    <span className='text-xs text-gray-500'>
                      {currentIndex + 1} / {characters.length}
                    </span>
                    <button
                      type='button'
                      onClick={handleNext}
                      className='rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700'
                    >
                      <ChevronRight className='size-5' />
                    </button>
                  </div>
                )}

                {/* 詳細リンク */}
                <Link
                  to='/characters'
                  search={{ character: currentCharacter.key }}
                  className='mt-3 block rounded-lg bg-linear-to-r from-pink-500 to-purple-500 py-2 text-center text-sm font-medium text-white transition-opacity hover:opacity-90'
                  onClick={() => setOpen(false)}
                >
                  詳細を見る
                </Link>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
