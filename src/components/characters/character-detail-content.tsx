import { Link, useRouter } from '@tanstack/react-router'

import dayjs from 'dayjs'
import { ArrowLeft, MapPin } from 'lucide-react'
import { motion } from 'motion/react'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { StoreData } from '@/schemas/store.dto'
import { formatDate } from '@/utils/calendar'
import { getDisplayName } from '@/utils/character'

type CharacterDetailContentProps = {
  character: StoreData
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
                src={character.character?.image_url}
                alt={character.character?.name || ''}
                className='object-cover'
              />
              <AvatarFallback className='text-2xl sm:text-3xl md:text-4xl bg-pink-100 text-pink-700'>
                {character.character?.name?.[0] || '?'}
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
                <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 truncate'>
                  {getDisplayName(character.character?.name || '')}
                </h1>
                <p className='text-lg text-pink-600 font-medium truncate'>{character.store?.name}</p>
              </div>
              <div className='shrink-0 flex flex-col gap-2'>
                {character.character?.twitter_id && (
                  <Button
                    asChild
                    className='rounded-full text-xs font-semibold h-7 px-4 bg-pink-600 text-white hover:bg-pink-700'
                  >
                    <a
                      href={`https://twitter.com/intent/follow?screen_name=${character.character.twitter_id}`}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      フォローする
                    </a>
                  </Button>
                )}
                {character.character?.is_biccame_musume && (
                  <CharacterVoteButton
                    characterId={character.id}
                    characterName={character.character.name}
                    variant='compact'
                  />
                )}
              </div>
            </div>
            <p className='text-sm text-gray-500 mt-1'>
              {character.store?.address &&
                Object.keys({
                  北海道: true,
                  青森県: true,
                  岩手県: true,
                  宮城県: true,
                  秋田県: true,
                  山形県: true,
                  福島県: true,
                  茨城県: true,
                  栃木県: true,
                  群馬県: true,
                  埼玉県: true,
                  千葉県: true,
                  東京都: true,
                  神奈川県: true,
                  新潟県: true,
                  富山県: true,
                  石川県: true,
                  福井県: true,
                  山梨県: true,
                  長野県: true,
                  岐阜県: true,
                  静岡県: true,
                  愛知県: true,
                  三重県: true,
                  滋賀県: true,
                  京都府: true,
                  大阪府: true,
                  兵庫県: true,
                  奈良県: true,
                  和歌山県: true,
                  鳥取県: true,
                  島根県: true,
                  岡山県: true,
                  広島県: true,
                  山口県: true,
                  徳島県: true,
                  香川県: true,
                  愛媛県: true,
                  高知県: true,
                  福岡県: true,
                  佐賀県: true,
                  長崎県: true,
                  熊本県: true,
                  大分県: true,
                  宮崎県: true,
                  鹿児島県: true,
                  沖縄県: true
                }).find((pref) => character.store?.address?.includes(pref))}
              {character.character?.birthday && ` · ${dayjs(character.character.birthday).format('M月D日')}生まれ`}
            </p>
            {/* リンク */}
            <div className='flex gap-3 mt-2 text-xs'>
              {character.store?.coordinates && (
                <Link
                  to='/location'
                  search={{ id: character.id }}
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
          <p className='text-gray-800 leading-relaxed'>{character.character?.description}</p>
        </motion.div>

        {/* 情報リスト */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5, ease: 'easeOut' }}
          className='border-t border-gray-200'
        >
          {character.character?.birthday && (
            <div className='flex items-center justify-between py-3 border-b border-gray-100'>
              <span className='text-gray-500'>誕生日</span>
              <span className='text-gray-900'>{formatDate(character.character.birthday)}</span>
            </div>
          )}
          {character.store?.birthday && (
            <div className='flex items-center justify-between py-3 border-b border-gray-100'>
              <span className='text-gray-500'>店舗開店日</span>
              <span className='text-gray-900'>{formatDate(character.store.birthday)}</span>
            </div>
          )}
          {character.store?.address && (
            <div className='flex items-start justify-between py-3 border-b border-gray-100'>
              <span className='text-gray-500 shrink-0'>住所</span>
              <div className='text-gray-900 text-right ml-4'>
                {character.store.postal_code && <div>〒{character.store.postal_code}</div>}
                <div>{character.store.address}</div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
