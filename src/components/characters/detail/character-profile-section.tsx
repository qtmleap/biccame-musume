import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ExternalLink, MapPin } from 'lucide-react'
import { motion } from 'motion/react'
import { CharacterFavoriteButton } from '@/components/characters/character-favorite-button'
import { CharacterFollowButton } from '@/components/characters/character-follow-button'
import { CharacterTwitterLink } from '@/components/characters/character-twitter-link'
import { CharacterVisitButton } from '@/components/characters/character-visit-button'
import { CharacterVoteButton } from '@/components/characters/character-vote-button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DURATION, FADE_IN_UP, SCALE_IN } from '@/lib/motion'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type CharacterProfileSectionProps = {
  character: StoreData
}

export const CharacterProfileSection = ({ character }: CharacterProfileSectionProps) => {
  return (
    <>
      <div className='mb-4 flex items-end justify-between gap-4'>
        <motion.div
          key={`avatar-${character.id}`}
          variants={SCALE_IN}
          initial='initial'
          animate='animate'
          transition={{ duration: DURATION.normal }}
        >
          <Avatar className='h-21.25 w-21.25 border border-card-border'>
            <AvatarImage
              src={character.character?.image_url}
              alt={character.character?.name || ''}
              className='object-cover scale-150 translate-y-4'
            />
            <AvatarFallback className='text-4xl'>{character.character?.name?.[0] || '?'}</AvatarFallback>
          </Avatar>
        </motion.div>

        <div className='flex items-center gap-2'>
          {/* ログイン必須（左） */}
          <CharacterFavoriteButton
            characterId={character.id}
            characterName={character.character?.name}
            isBiccameMusume={character.character?.is_biccame_musume}
          />
          <CharacterVisitButton
            storeKey={character.id}
            storeName={character.store?.name}
            hasStore={Boolean(character.store)}
          />
          {/* ログイン不要 */}
          {character.character?.twitter_id && (
            <CharacterFollowButton twitterId={character.character.twitter_id} iconOnly />
          )}
          {/* 応援は一番右（primary action） */}
          {character.character?.is_biccame_musume && (
            <CharacterVoteButton characterId={character.id} characterName={character.character.name} iconOnly />
          )}
        </div>
      </div>

      <motion.div
        key={`profile-${character.id}`}
        variants={FADE_IN_UP}
        initial='initial'
        animate='animate'
        transition={{ duration: DURATION.normal, delay: 0.2 }}
        className='mb-6'
      >
        <h1 className='text-2xl font-bold text-foreground'>{getDisplayName(character.character?.name || '')}</h1>
        <CharacterTwitterLink twitterId={character.character?.twitter_id} />
        <p className='text-sm text-muted-foreground mt-3 leading-relaxed'>{character.character?.description}</p>

        {character.character?.is_biccame_musume && (
          <a
            href={`https://biccame.jp/profile/${character.id}.html`}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-sm text-brand hover:text-brand/80 hover:underline mt-3'
          >
            <ExternalLink className='h-3.5 w-3.5' />
            公式プロフィール
          </a>
        )}

        <div className='flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground'>
          {character.prefecture && (
            <div className='flex items-center gap-1'>
              <MapPin className='h-4 w-4' />
              <span>{character.prefecture}</span>
            </div>
          )}
          {character.character?.birthday && <span>{dayjs(character.character.birthday).format('M月D日')}生まれ</span>}
          {character.coordinates && (
            <Link to='/location' search={{ id: character.id }} className='text-brand hover:underline'>
              地図で見る
            </Link>
          )}
        </div>
      </motion.div>
    </>
  )
}
