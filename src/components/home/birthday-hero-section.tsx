import { Link } from '@tanstack/react-router'
import { Cake } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { Character } from '@/schemas/character.dto'

type BirthdayHeroSectionProps = {
  characters: Character[]
}

/**
 * 誕生日画像のパスを取得
 */
const getBirthdayImagePath = (key: string): string => {
  return `/birth/${key}.webp`
}

/**
 * ヒーローセクション版
 * トップページのヘッダー部分に統合表示
 */
export const BirthdayHeroSection = ({ characters }: BirthdayHeroSectionProps) => {
  if (characters.length === 0) return null

  // 複数キャラクターがいる場合は最初の一人をメインに表示
  const mainCharacter = characters[0]
  const otherCharacters = characters.slice(1)

  return (
    <motion.section
      className='relative mb-6 overflow-hidden rounded-2xl bg-linear-to-r from-pink-500 to-purple-500 p-6'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 背景装飾 */}
      <div className='absolute inset-0 overflow-hidden'>
        <div className='absolute top-0 right-0 size-40 -translate-y-1/2 translate-x-1/2 rounded-full bg-white/10' />
        <div className='absolute bottom-0 left-0 size-32 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/10' />
      </div>

      <div className='relative flex flex-col items-center gap-6 md:flex-row'>
        {/* キャラクター画像 */}
        <motion.div
          className='relative'
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <img
            src={getBirthdayImagePath(mainCharacter.key)}
            alt={`${mainCharacter.character_name}の誕生日`}
            className='h-48 w-auto object-contain drop-shadow-xl md:h-64'
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.src = mainCharacter.profile_image_url || ''
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
            <p className='mt-2 text-2xl font-semibold'>{mainCharacter.character_name}</p>
            <p className='text-white/80'>{mainCharacter.store_name}</p>
          </motion.div>

          {/* アクションボタン */}
          <motion.div
            className='mt-4 flex flex-wrap justify-center gap-2 md:justify-start'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Button asChild variant='secondary' size='sm'>
              <Link to='/characters' search={{ character: mainCharacter.key }}>
                詳細を見る
              </Link>
            </Button>
            {mainCharacter.twitter_url && (
              <Button asChild variant='outline' size='sm' className='border-white/30 text-white hover:bg-white/20'>
                <a href={mainCharacter.twitter_url} target='_blank' rel='noopener noreferrer'>
                  お祝いする
                </a>
              </Button>
            )}
          </motion.div>

          {/* 他の誕生日キャラクター */}
          {otherCharacters.length > 0 && (
            <motion.div
              className='mt-4'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <p className='mb-2 text-xs text-white/70'>他にも誕生日のキャラクターがいます</p>
              <div className='flex justify-center gap-2 md:justify-start'>
                {otherCharacters.map((character) => (
                  <Link key={character.key} to='/characters' search={{ character: character.key }}>
                    <Avatar className='size-10 border-2 border-white/50 transition-transform hover:scale-110'>
                      <AvatarImage src={character.profile_image_url} alt={character.character_name} />
                      <AvatarFallback>{character.character_name.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.section>
  )
}
