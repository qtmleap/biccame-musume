import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { motion } from 'motion/react'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type CharacterListCardProps = {
  character: StoreData
}

/**
 * ビッカメ娘一覧表示用コンパクトカードコンポーネント
 */
export const CharacterListCard = ({ character }: CharacterListCardProps) => {
  const isGraduated = !character.character?.twitter_id

  return (
    <motion.div
      layout
      layoutId={character.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        layout: { type: 'spring', stiffness: 300, damping: 30 },
        opacity: { duration: 0.2 }
      }}
      className='h-full'
    >
      <div className='h-full flex flex-col'>
        <Link to='/characters/$id' params={{ id: character.id }} className='block flex-1'>
          <div
            className={`h-full rounded-lg border shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer p-4 ${
              isGraduated
                ? 'border-gray-300 bg-gray-200/90 hover:bg-gray-200 hover:border-gray-400'
                : 'border-pink-200/40 bg-white/80 hover:bg-white/90 hover:border-pink-400/60'
            }`}
          >
            <div className='flex items-center gap-3'>
              <Avatar className='h-16 w-16'>
                <AvatarImage
                  src={character.character?.image_url}
                  alt={character.character?.name || ''}
                  className='mix-blend-multiply'
                />
                <AvatarFallback className={isGraduated ? 'bg-gray-200 text-gray-600' : 'bg-pink-100 text-pink-700'}>
                  {character.character?.name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
              <div className='flex-1 min-w-0'>
                <h3 className='text-lg font-semibold mb-2 truncate text-gray-800'>
                  {getDisplayName(character.character?.name || '')}
                </h3>
                <div className='flex items-center gap-2 min-h-6 flex-wrap'>
                  {character.store?.address && (
                    <Badge variant='secondary' className='text-xs bg-blue-100 text-blue-700 border-blue-200'>
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
                      }).find((pref) => character.store?.address?.includes(pref)) || ''}
                    </Badge>
                  )}
                  {character.character?.birthday && (
                    <Badge variant='secondary' className='text-xs bg-pink-100 text-pink-700 border-pink-200'>
                      {dayjs(character.character.birthday).format('M月D日')}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Link>
        <div className='flex justify-end gap-2 mt-2'>
          <CharacterVoteButton
            characterId={character.id}
            characterName={character.character?.name || ''}
            variant='compact'
            enableVoteCount={false}
          />
          <Button
            size='sm'
            variant='outline'
            asChild={!isGraduated}
            disabled={isGraduated}
            className='rounded-full px-4 h-7 text-xs font-semibold'
            onClick={(e) => {
              e.stopPropagation()
              if (isGraduated) return
            }}
          >
            {isGraduated ? (
              <span>フォロー</span>
            ) : (
              <a href={`https://x.com/${character.character?.twitter_id}`} target='_blank' rel='noopener noreferrer'>
                フォロー
              </a>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
