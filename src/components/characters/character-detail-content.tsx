import { Link, useRouter } from '@tanstack/react-router'

import dayjs from 'dayjs'
import { ArrowLeft, Calendar, Clock, MapPin, Phone, Store, Train } from 'lucide-react'
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
    <div className='min-h-screen bg-pink-50'>
      <div className='container mx-auto px-4 max-w-2xl'>
        {/* 戻るボタン */}
        <div className='pt-4 pb-2'>
          <Button
            variant='ghost'
            size='sm'
            className='text-gray-600 hover:text-gray-900 -ml-2'
            onClick={() => router.history.back()}
          >
            <ArrowLeft className='h-4 w-4 mr-1' />
            戻る
          </Button>
        </div>

        {/* プロフィールセクション */}
        <div className='mb-4'>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Avatar className='h-21.25 w-21.25 border-2 border-gray-800'>
              <AvatarImage
                src={character.character?.image_url}
                alt={character.character?.name || ''}
                className='object-cover scale-150'
              />
              <AvatarFallback className='text-4xl bg-pink-100 text-pink-700'>
                {character.character?.name?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
          </motion.div>
        </div>

        {/* アクションボタン */}
        <div className='flex justify-end gap-2 mb-4'>
          {character.character?.twitter_id && (
            <Button asChild className='rounded-full font-semibold bg-black text-white hover:bg-gray-800'>
              <a
                href={`https://twitter.com/intent/follow?screen_name=${character.character.twitter_id}`}
                target='_blank'
                rel='noopener noreferrer'
              >
                フォロー
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

        {/* 名前と説明 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className='mb-6'
        >
          <h1 className='text-2xl font-bold text-gray-900'>{getDisplayName(character.character?.name || '')}</h1>
          {character.character?.twitter_id && (
            <p className='text-gray-500 text-sm'>@{character.character.twitter_id}</p>
          )}
          <p className='text-gray-800 mt-3 leading-relaxed'>{character.character?.description}</p>

          {/* メタ情報 */}
          <div className='flex flex-wrap gap-4 mt-3 text-sm text-gray-500'>
            {character.store?.address && (
              <div className='flex items-center gap-1'>
                <MapPin className='h-4 w-4' />
                <span>
                  {Object.keys({
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
                </span>
              </div>
            )}
            {character.character?.birthday && <span>{dayjs(character.character.birthday).format('M月D日')}生まれ</span>}
            {character.store?.coordinates && (
              <Link to='/location' search={{ id: character.id }} className='text-pink-600 hover:underline'>
                地図で見る
              </Link>
            )}
          </div>
        </motion.div>

        {/* 店舗情報セクション */}
        {character.store && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className='space-y-3'
          >
            <h2 className='text-xl font-bold text-gray-900'>店舗情報</h2>
            <div className='space-y-3'>
              {character.store.name && (
                <div className='flex items-start gap-3'>
                  <Store className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-gray-500'>店舗名</p>
                    <p className='text-gray-900'>{character.store.name}</p>
                  </div>
                </div>
              )}

              {character.store.address && (
                <div className='flex items-start gap-3'>
                  <MapPin className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-gray-500'>住所</p>
                    {character.store.postal_code && <p className='text-gray-900'>〒{character.store.postal_code}</p>}
                    <p className='text-gray-900'>{character.store.address}</p>
                  </div>
                </div>
              )}

              {character.store.phone && (
                <div className='flex items-start gap-3'>
                  <Phone className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-gray-500'>電話番号</p>
                    <a href={`tel:${character.store.phone}`} className='text-gray-900 hover:text-pink-600'>
                      {character.store.phone}
                    </a>
                  </div>
                </div>
              )}

              {character.store.hours && character.store.hours.length > 0 && (
                <div className='flex items-start gap-3'>
                  <Clock className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-gray-500'>営業時間</p>
                    <div className='space-y-1'>
                      {character.store.hours.map((hour, index) => (
                        <div key={index} className='text-gray-900'>
                          {hour.type === 'weekday' && '平日: '}
                          {hour.type === 'weekend' && '土日祝: '}
                          {hour.type === 'holiday' && '日曜・祝日: '}
                          {hour.type === 'all' && ''}
                          {hour.open_time}～{hour.close_time}
                        </div>
                      ))}
                      {character.store.open_all_year && <div className='text-sm text-gray-500'>年中無休</div>}
                    </div>
                  </div>
                </div>
              )}

              {character.store.access && character.store.access.length > 0 && (
                <div className='flex items-start gap-3'>
                  <Train className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-gray-500'>アクセス</p>
                    <div className='space-y-2'>
                      {character.store.access.map((access, index) => (
                        <div key={index}>
                          <p className='text-gray-900 font-medium'>{access.station}</p>
                          {access.description && <p className='text-sm text-gray-600'>{access.description}</p>}
                          {access.lines && access.lines.length > 0 && (
                            <p className='text-sm text-gray-500'>{access.lines.join(' / ')}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {character.store.birthday && (
                <div className='flex items-start gap-3'>
                  <Calendar className='h-5 w-5 text-gray-400 shrink-0 mt-0.5' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-gray-500'>店舗開店日</p>
                    <p className='text-gray-900'>{formatDate(character.store.birthday)}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
