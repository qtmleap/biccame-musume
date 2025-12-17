import { Link, useRouter } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, ExternalLink, MapPin } from 'lucide-react'
import { motion } from 'motion/react'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { Character } from '@/schemas/character.dto'
import { formatDate } from '@/utils/calendar'

type CharacterDetailContentProps = {
  character: Character
}

/**
 * キャラクター詳細コンテンツ
 */
export const CharacterDetailContent = ({ character }: CharacterDetailContentProps) => {
  const router = useRouter()

  return (
    <div className='min-h-screen'>
      <div className='container mx-auto px-4 py-6 max-w-3xl'>
        {/* 戻るボタン */}
        <div className='mb-4'>
          <Button
            variant='ghost'
            size='sm'
            className='text-pink-600 hover:text-pink-700 -ml-2'
            onClick={() => router.history.back()}
          >
            <ArrowLeft className='h-4 w-4 mr-1' />
            戻る
          </Button>
        </div>

        {/* ヒーローセクション */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className='flex gap-4 sm:gap-6 mb-6'
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className='shrink-0'
          >
            <Avatar className='h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40 shadow-lg border-2 border-pink-300'>
              <AvatarImage
                src={character.image_urls?.[1] || character.image_urls?.[0]}
                alt={character.character_name}
                className='object-cover'
              />
              <AvatarFallback className='text-2xl sm:text-3xl md:text-4xl bg-pink-100 text-pink-700'>
                {character.character_name[0]}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            className='flex flex-col justify-end min-w-0 flex-1'
          >
            <div className='flex items-start justify-between gap-2'>
              <div className='min-w-0 flex-1'>
                <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 truncate'>{character.character_name}</h1>
                <p className='text-lg text-pink-600 font-medium truncate'>{character.store_name}</p>
              </div>
              <div className='shrink-0 flex flex-col gap-2'>
                {character.twitter_url && (
                  <a
                    href={`https://twitter.com/intent/follow?screen_name=${character.twitter_url.split('/').pop()}`}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <Button
                      size='sm'
                      className='bg-pink-600 hover:bg-pink-700 text-white rounded-full text-xs w-full font-semibold'
                    >
                      フォローする
                    </Button>
                  </a>
                )}
                <CharacterVoteButton
                  characterId={character.key}
                  characterName={character.character_name}
                  variant='compact'
                />
              </div>
            </div>
            <p className='text-sm text-gray-500 mt-1'>
              {character.address?.split(/都|道|府|県/)[0]}
              {character.address?.match(/都|道|府|県/)?.[0]}
              {character.character_birthday && ` · ${dayjs(character.character_birthday).format('M月D日')}生まれ`}
            </p>
            {/* リンク */}
            <div className='flex gap-3 mt-2 text-xs'>
              <a
                href={character.detail_url}
                target='_blank'
                rel='noopener noreferrer'
                className='text-gray-400 hover:text-pink-600 hover:underline flex items-center gap-1 transition-colors'
              >
                詳細を見る
                <ExternalLink className='h-3 w-3' />
              </a>
              {character.latitude && character.longitude && (
                <Link
                  to='/location'
                  search={{ id: character.key }}
                  className='text-gray-400 hover:text-pink-600 hover:underline flex items-center gap-1 transition-colors'
                >
                  地図で見る
                  <MapPin className='h-3 w-3' />
                </Link>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* 説明文 */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4, ease: 'easeOut' }}
          className='mb-8'
        >
          <h2 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>プロフィール</h2>
          <p className='text-gray-800 leading-relaxed'>{character.description}</p>
        </motion.div>

        {/* 情報リスト */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5, ease: 'easeOut' }}
          className='border-t border-gray-200'
        >
          {character.character_birthday && (
            <div className='flex items-center justify-between py-3 border-b border-gray-100'>
              <span className='text-gray-500'>誕生日</span>
              <span className='text-gray-900'>{formatDate(character.character_birthday)}</span>
            </div>
          )}
          {character.store_birthday && (
            <div className='flex items-center justify-between py-3 border-b border-gray-100'>
              <span className='text-gray-500'>店舗開店日</span>
              <span className='text-gray-900'>{formatDate(character.store_birthday)}</span>
            </div>
          )}
          {character.address && (
            <div className='flex items-start justify-between py-3 border-b border-gray-100'>
              <span className='text-gray-500 shrink-0'>住所</span>
              <div className='text-gray-900 text-right ml-4'>
                {character.zipcode && <div>〒{character.zipcode}</div>}
                <div>{character.address}</div>
              </div>
            </div>
          )}
          {character.store_link && (
            <a
              href={character.store_link}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center justify-between py-3 border-b border-gray-100'
            >
              <span className='text-gray-500'>店舗情報</span>
              <span className='text-pink-600'>ビックカメラ.com</span>
            </a>
          )}
        </motion.div>
      </div>
    </div>
  )
}
