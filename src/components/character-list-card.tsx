import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { CharacterFollowButton } from '@/components/characters/character-follow-button'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type CharacterListCardProps = {
  character: StoreData
  index?: number
}

const STICKER_SHADOW_SM = 'drop-shadow(0 3px 5px rgba(0,0,0,0.10))'

const ROTATIONS = [
  'rotate-[1.5deg]',
  '-rotate-[2deg]',
  'rotate-[1deg]',
  '-rotate-[1.5deg]',
  'rotate-[2deg]',
  '-rotate-[1deg]'
]

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
export const CharacterListCard = ({ character, index = 0 }: CharacterListCardProps) => {
  const rotation = ROTATIONS[index % ROTATIONS.length]
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
      <div className={cn('h-full', rotation)}>
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

          <div className='flex items-center gap-3'>
            <Link
              to='/characters/$id'
              params={{ id: character.id }}
              className='shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
            >
              <Avatar className='h-14 w-14 border-2 border-card-border'>
                <AvatarImage
                  src={character.character?.image_url}
                  alt={character.character?.name || ''}
                  className='mix-blend-multiply scale-150 translate-y-[20%]'
                />
                <AvatarFallback className='bg-brand/10 text-brand'>
                  {character.character?.name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div className='flex-1 min-w-0 flex flex-col gap-1.5'>
              <Link
                to='/characters/$id'
                params={{ id: character.id }}
                className='rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
              >
                <h3
                  className='truncate text-foreground text-sm md:text-base'
                  style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 800 }}
                >
                  {getDisplayName(character.character?.name || '')}
                </h3>
              </Link>
              <div className='flex justify-end gap-2'>
                <CharacterFollowButton twitterId={character.character?.twitter_id} />
                <CharacterVoteButton
                  characterId={character.id}
                  characterName={character.character?.name || ''}
                  variant='compact'
                  enableVoteCount={false}
                  isBiccameMusume={character.character?.is_biccame_musume}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
