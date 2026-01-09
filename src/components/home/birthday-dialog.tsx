import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Character } from '@/schemas/character.dto'

type BirthdayDialogProps = {
  characters: Character[]
}

/**
 * 誕生日画像のパスを取得
 * birth/{key}.webp が存在する場合はそれを返す
 */
const getBirthdayImagePath = (key: string): string => {
  return `/birth/${key}.webp`
}

/**
 * 紙吹雪コンポーネント
 */
const Confetti = ({ count = 30 }: { count?: number }) => {
  const confettiItems = useMemo(() => {
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff85a1', '#a855f7']
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 2,
      color: colors[i % colors.length],
      rotation: Math.random() * 360
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
          <div className='size-2 rounded-full' style={{ backgroundColor: item.color }} />
        </motion.div>
      ))}
    </div>
  )
}

/**
 * 誕生日キャラクター表示ダイアログ
 * トップページを開いたときにアニメーション付きで表示
 */
export const BirthdayDialog = ({ characters }: BirthdayDialogProps) => {
  const [open, setOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [imageError, setImageError] = useState(false)

  // セッション中に一度だけ表示するためのキー（本番環境のみ）
  const sessionKey = `birthday-shown-${dayjs().format('YYYY-MM-DD')}`

  useEffect(() => {
    if (characters.length === 0) return

    // 開発環境では常に表示、本番環境では同じ日に既に表示した場合はスキップ
    if (!import.meta.env.DEV) {
      const alreadyShown = sessionStorage.getItem(sessionKey)
      if (alreadyShown) return
    }

    // 少し遅延させてから表示
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

  const handleNext = () => {
    if (currentIndex < characters.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setImageError(false)
    } else {
      setOpen(false)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setImageError(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className='max-w-md overflow-hidden p-0'>
        <div className='relative'>
          {/* 誕生日画像 */}
          <div className='relative aspect-square w-full overflow-hidden bg-linear-to-b from-pink-100 to-purple-100'>
            <AnimatePresence mode='wait'>
              <motion.div
                key={currentCharacter.key}
                className='flex size-full items-center justify-center'
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -20 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                {!imageError ? (
                  <motion.img
                    src={getBirthdayImagePath(currentCharacter.key)}
                    alt={`${currentCharacter.character_name}の誕生日`}
                    className='size-full object-contain'
                    initial={{ scale: 0.9 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    onError={() => setImageError(true)}
                  />
                ) : (
                  // 画像がない場合はプロフィール画像を表示
                  <motion.img
                    src={currentCharacter.profile_image_url}
                    alt={currentCharacter.character_name}
                    className='max-h-[80%] max-w-[80%] object-contain'
                    animate={{ y: [0, -10, 0] }}
                    transition={{
                      duration: 1.5,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: 'easeInOut'
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {/* 紙吹雪アニメーション */}
            <Confetti />
          </div>

          {/* テキストコンテンツ */}
          <motion.div
            className='p-6 text-center'
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <DialogHeader>
              <DialogTitle className='text-2xl'>
                <motion.span
                  className='inline-block bg-linear-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent'
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{
                    duration: 2,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'easeInOut'
                  }}
                >
                  Happy Birthday!
                </motion.span>
              </DialogTitle>
              <DialogDescription className='text-lg'>
                今日は <span className='font-bold text-foreground'>{currentCharacter.character_name}</span> の誕生日です
              </DialogDescription>
            </DialogHeader>

            <p className='mt-2 text-sm text-muted-foreground'>{currentCharacter.store_name}</p>

            {/* ナビゲーションボタン */}
            <div className='mt-4 flex items-center justify-center gap-2'>
              {characters.length > 1 && (
                <>
                  <Button variant='outline' size='sm' onClick={handlePrevious} disabled={currentIndex === 0}>
                    前へ
                  </Button>
                  <span className='text-sm text-muted-foreground'>
                    {currentIndex + 1} / {characters.length}
                  </span>
                </>
              )}
              <Button variant='outline' size='sm' onClick={handleNext}>
                {currentIndex === characters.length - 1 ? '閉じる' : '次へ'}
              </Button>
            </div>

            {/* キャラクター詳細へのリンク */}
            <div className='mt-4'>
              <Link
                to='/characters'
                search={{ character: currentCharacter.key }}
                className='text-sm text-primary hover:underline'
                onClick={() => setOpen(false)}
              >
                詳細を見る
              </Link>
            </div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
