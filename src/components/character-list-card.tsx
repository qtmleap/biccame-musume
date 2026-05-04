import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { CharacterFollowButton } from '@/components/characters/character-follow-button'
import { CharacterTwitterLink } from '@/components/characters/character-twitter-link'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DURATION } from '@/lib/motion'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type CharacterListCardProps = {
  character: StoreData
}

/**
 * ビッカメ娘一覧表示用コンパクトカードコンポーネント
 */
export const CharacterListCard = ({ character }: CharacterListCardProps) => {
  return (
    <motion.div
      layout
      layoutId={character.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        duration: DURATION.normal,
        ease: 'easeOut'
      }}
      className='h-full'
    >
      <div className='h-full flex flex-col'>
        <Link
          to='/characters/$id'
          params={{ id: character.id }}
          className='flex-1 block border-card rounded-lg p-3 hover:border-brand/40 transition-colors bg-card'
        >
          <div className='flex items-center gap-3 mb-2'>
            <Avatar className='h-16 w-16 border-2 border-card-border'>
              <AvatarImage
                src={character.character?.image_url}
                alt={character.character?.name || ''}
                className='mix-blend-multiply scale-150 translate-y-[20%]'
              />
              <AvatarFallback className='bg-brand/10 text-brand'>
                {character.character?.name?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
            <div className='flex-1 min-w-0'>
              <h3 className='text-base font-bold line-clamp-1 text-foreground'>
                {getDisplayName(character.character?.name || '')}
              </h3>
              <div className='h-5'>
                <CharacterTwitterLink twitterId={character.character?.twitter_id} />
              </div>
            </div>
          </div>
          <div className='flex justify-end gap-2 h-9'>
            <CharacterFollowButton twitterId={character.character?.twitter_id} />
            <CharacterVoteButton
              characterId={character.id}
              characterName={character.character?.name || ''}
              variant='compact'
              enableVoteCount={false}
              isBiccameMusume={character.character?.is_biccame_musume}
            />
          </div>
        </Link>
      </div>
    </motion.div>
  )
}
