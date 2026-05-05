import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { CharacterFollowButton } from '@/components/characters/character-follow-button'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useMediaQuery } from '@/hooks/use-media-query'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_SHADOW_SM, stickerTransformStyle } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type CharacterListCardProps = {
  character: StoreData
  index?: number
  /** 紙の傾き（degrees）。未指定なら index 巡回、0 で傾きなし。 */
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
  // 1列レイアウトでは交互傾きが不自然なので無効化（rotation 明示時はそれを尊重）
  const isMultiColumn = useMediaQuery('(min-width: 640px)')
  const rotationDeg = rotation ?? (isMultiColumn ? getStickerRotation(index) : 0)
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
      style={{ filter: STICKER_SHADOW_SM }}
    >
      <div className='h-full' style={stickerTransformStyle(rotationDeg)}>
        <div className='relative h-full bg-card rounded-xl border border-zinc-200 dark:border-card-border p-3'>
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

          <div className='relative flex items-center gap-3 pointer-events-none'>
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
              <h3
                className='truncate text-foreground text-sm md:text-base'
                style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 800 }}
              >
                {getDisplayName(character.character?.name || '')}
              </h3>
              <div className='flex justify-end gap-2 pointer-events-auto'>
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
      </div>
    </motion.div>
  )
}
