import { Link } from '@tanstack/react-router'
import { Cake } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { StoreData } from '@/schemas/store.dto'

type BirthdayHeroSectionProps = {
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
 * フェードイン・フェードアウトで切り替わる名前と店舗名コンポーネント
 */
const RotatingCharacterInfo = ({ characters }: { characters: StoreData[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (characters.length <= 1) return

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % characters.length)
    }, 3000) // 3秒ごとに切り替え

    return () => clearInterval(interval)
  }, [characters.length])

  const currentCharacter = characters[currentIndex]

  return (
    <AnimatePresence mode='wait'>
      <motion.div
        key={currentCharacter.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
        className='mt-2'
      >
        <p className='text-2xl font-semibold'>{currentCharacter.character?.name}</p>
        <p className='text-white/80'>{currentCharacter.store?.name}</p>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * ヒーローセクション版
 * トップページのヘッダー部分に統合表示
 */
export const BirthdayHeroSection = ({ characters }: BirthdayHeroSectionProps) => {
  if (characters.length === 0) return null

  // 複数キャラクターがいる場合は最初の一人をメインに表示
  const mainCharacter = characters[0]

  return (
    <motion.section
      className='relative mb-6 overflow-hidden bg-linear-to-r from-pink-500 to-purple-500 p-6'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 背景装飾 */}
      <div className='absolute inset-0 overflow-hidden'>
        <div className='absolute top-0 right-0 size-40 -translate-y-1/2 translate-x-1/2 rounded-full bg-white/10' />
        <div className='absolute bottom-0 left-0 size-32 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/10' />
      </div>

      <div className='relative flex flex-col items-center gap-6 md:flex-row max-w-6xl mx-auto px-4 md:px-8'>
        {/* キャラクター画像 */}
        <motion.div
          className='relative'
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <img
            src={getBirthdayImagePath(characters)}
            alt={`${mainCharacter.character?.name}の誕生日`}
            className='h-48 w-auto object-contain drop-shadow-xl md:h-64'
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.src = mainCharacter.character?.image_url || ''
            }}
          />
          {/* ケーキアイコン */}
          <motion.div
            className='absolute -top-2 -right-2 rounded-full bg-yellow-400 p-2 shadow-lg'
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
          >
            <Cake className='size-5 text-yellow-800' />
          </motion.div>
        </motion.div>

        {/* テキストコンテンツ */}
        <div className='flex-1 text-center text-white md:text-left'>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <p className='text-sm font-medium text-white/80'>Today's Birthday</p>
            <motion.h2
              className='mt-1 text-3xl font-bold md:text-4xl'
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
            >
              Happy Birthday!
            </motion.h2>
            {characters.length > 1 ? (
              <RotatingCharacterInfo characters={characters} />
            ) : (
              <div className='mt-2'>
                <p className='text-2xl font-semibold'>{mainCharacter.character?.name}</p>
                <p className='text-white/80'>{mainCharacter.store?.name}</p>
              </div>
            )}
          </motion.div>

          {/* アクションボタン */}
          <motion.div
            className='mt-4 flex flex-wrap justify-center gap-2 md:justify-start'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Button asChild variant='secondary' size='sm'>
              <Link to='/characters/$id' params={{ id: mainCharacter.id }}>
                詳細を見る
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.section>
  )
}
