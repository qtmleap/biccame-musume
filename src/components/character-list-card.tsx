import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { prefectureToRegion } from '@/atoms/filter-atom'
import { CharacterFollowButton } from '@/components/characters/character-follow-button'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_DENSE } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { REGION_LABELS } from '@/locales/app.content'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type CharacterListCardProps = {
  character: StoreData
  index?: number
  /** 紙の傾き（degrees）。未指定なら密な一覧の基準として水平に揃える。 */
  rotation?: number
}

const TAPES: ({ side: 'left' | 'right'; color: string; angle: string } | null)[] = [
  { side: 'left', color: 'bg-yellow-200/80', angle: '-rotate-[12deg]' },
  { side: 'right', color: 'bg-pink-200/80', angle: 'rotate-[10deg]' },
  { side: 'left', color: 'bg-blue-200/80', angle: '-rotate-[8deg]' },
  null,
  { side: 'right', color: 'bg-green-200/80', angle: 'rotate-[8deg]' },
  null
]

/**
 * ビッカメ娘一覧表示用コンパクトカードコンポーネント（ステッカー風）
 */
export const CharacterListCard = ({ character, index = 0, rotation }: CharacterListCardProps) => {
  const rotationDeg = getStickerRotation(index, rotation, 'dense')
  const tape = TAPES[index % TAPES.length]

  return (
    <motion.div
      layout
      layoutId={character.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: DURATION.normal, ease: 'easeOut' }}
      className='h-full'
      style={{ filter: STICKER_SHADOW_DENSE }}
    >
      <motion.div
        className='h-full'
        style={{ rotate: rotationDeg }}
        whileTap={{ scale: 0.97 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <div className='relative h-full bg-card rounded-xl border border-zinc-200 dark:border-card-border hover:border-brand/40 focus-within:border-brand/40 p-3'>
          {tape && (
            <div
              aria-hidden
              className={cn(
                'absolute -top-1.5 w-8 h-3 rounded-sm',
                tape.color,
                tape.angle,
                tape.side === 'left' ? 'left-4' : 'right-4'
              )}
            />
          )}

          <Link
            to='/characters/$id'
            params={{ id: character.id }}
            aria-label={`${character.character?.name ?? 'キャラクター'}の詳細を見る`}
            className='absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
          />

          <div className='relative flex items-start gap-3 pointer-events-none [&_*]:pointer-events-none [&_button]:pointer-events-auto [&_a]:pointer-events-auto'>
            <Avatar className='h-14 w-14 border-2 border-card-border shrink-0'>
              <AvatarImage
                src={character.character?.image_url}
                alt={character.character?.name || ''}
                className='mix-blend-multiply scale-150 translate-y-[20%]'
              />
              <AvatarFallback className='bg-brand/10 text-brand'>
                {character.character?.name?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
            <div className='flex-1 min-w-0 flex flex-col gap-1.5'>
              <h3 className='font-bold truncate text-foreground text-sm md:text-base'>
                {getDisplayName(character.character?.name || '')}
              </h3>
              <p
                data-character-store
                className='text-sm leading-5 h-10 line-clamp-2 break-words text-foreground'
                title={character.store?.name}
              >
                {character.store?.name ? character.store.name : '店舗情報未登録'}
              </p>
              <p data-character-region className='text-xs leading-5 h-5 truncate text-foreground'>
                {character.prefecture
                  ? `${prefectureToRegion[character.prefecture] ? REGION_LABELS[prefectureToRegion[character.prefecture]] : '地域未登録'}・${character.prefecture}`
                  : '地域未登録'}
              </p>
              <div className='flex justify-end gap-2 mt-1'>
                <CharacterFollowButton twitterId={character.character?.twitter_id} iconOnly />
                <CharacterVoteButton
                  characterId={character.id}
                  characterName={character.character?.name || ''}
                  enableVoteCount={false}
                  isBiccameMusume={character.character?.is_biccame_musume}
                  iconOnly
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
