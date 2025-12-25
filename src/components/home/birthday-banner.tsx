import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Character } from '@/schemas/character.dto'

type BirthdayBannerProps = {
  characters: Character[]
}

/**
 * トースト/バナー版
 * 画面上部にスライドインするバナー形式
 */
export const BirthdayBanner = ({ characters }: BirthdayBannerProps) => {
  const [open, setOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  const sessionKey = `birthday-banner-shown-${new Date().toISOString().split('T')[0]}`

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

  // 自動で次のキャラクターに切り替え
  useEffect(() => {
    if (!open || characters.length <= 1) return

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % characters.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [open, characters.length])

  if (characters.length === 0) return null

  const currentCharacter = characters[currentIndex]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className='fixed top-4 right-4 left-4 z-50 mx-auto max-w-lg'
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        >
          <div className='relative overflow-hidden rounded-xl bg-linear-to-r from-pink-500 to-purple-500 p-4 shadow-xl'>
            {/* 閉じるボタン */}
            <button
              type='button'
              onClick={() => setOpen(false)}
              className='absolute top-2 right-2 rounded-full p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white'
            >
              <X className='size-4' />
            </button>

            <div className='flex items-center gap-4'>
              {/* キャラクター画像 */}
              <motion.div
                key={currentCharacter.key}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Avatar className='size-16 border-2 border-white/50'>
                  <AvatarImage src={currentCharacter.profile_image_url} alt={currentCharacter.character_name} />
                  <AvatarFallback>{currentCharacter.character_name.charAt(0)}</AvatarFallback>
                </Avatar>
              </motion.div>

              {/* テキスト */}
              <div className='flex-1'>
                <motion.p
                  className='text-sm font-medium text-white/90'
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                >
                  Happy Birthday!
                </motion.p>
                <p className='text-lg font-bold text-white'>{currentCharacter.character_name}</p>
                <p className='text-xs text-white/70'>{currentCharacter.store_name}</p>
              </div>

              {/* 詳細リンク */}
              <Link
                to='/characters'
                search={{ character: currentCharacter.key }}
                className='rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/30'
                onClick={() => setOpen(false)}
              >
                詳細
              </Link>
            </div>

            {/* 複数キャラクターの場合のインジケーター */}
            {characters.length > 1 && (
              <div className='mt-3 flex justify-center gap-1'>
                {characters.map((_, index) => (
                  <button
                    key={characters[index].key}
                    type='button'
                    className={`size-2 rounded-full transition-colors ${
                      index === currentIndex ? 'bg-white' : 'bg-white/40'
                    }`}
                    onClick={() => setCurrentIndex(index)}
                  />
                ))}
              </div>
            )}

            {/* 装飾 */}
            <div className='pointer-events-none absolute top-0 left-0 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10' />
            <div className='pointer-events-none absolute right-0 bottom-0 size-16 translate-x-1/2 translate-y-1/2 rounded-full bg-white/10' />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
