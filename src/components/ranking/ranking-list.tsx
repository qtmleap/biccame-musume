import { Link } from '@tanstack/react-router'
import { Crown, Medal } from 'lucide-react'
import { motion } from 'motion/react'
import { BulkVoteButton } from '@/components/characters/bulk-vote-button'
import { RankingVoteBadge } from '@/components/ranking/ranking-vote-badge'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { StoreData } from '@/schemas/store.dto'

type CharacterWithVotes = StoreData & {
  voteCount: number
}

type RankingListProps = {
  characters: CharacterWithVotes[]
}

/**
 * 投票案内（票がまだ0件のときの空状態）
 */
const EmptyVoteInfo = () => {
  return (
    <motion.div
      className='text-center py-12'
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: 'easeOut' }}
    >
      <motion.p
        className='text-muted-foreground text-base mb-2'
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.normal, delay: 0.2 }}
      >
        まだ票が入ってないよ
      </motion.p>
      <motion.p
        className='text-muted-foreground text-sm mb-6'
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.normal, delay: 0.3 }}
      >
        上のボタンで全員に投票するか、キャラ一覧から推しに投票しよ
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DURATION.normal, delay: 0.4, type: 'spring', stiffness: 200 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Link
          to='/characters'
          className='inline-block px-4 py-2 bg-brand text-brand-foreground rounded-full hover:bg-brand/90 transition-colors text-sm font-medium shadow-lg hover:shadow-xl'
        >
          キャラクター一覧へ
        </Link>
      </motion.div>
    </motion.div>
  )
}

/**
 * 順位を計算（同数の場合は同じ順位）
 */
const calculateRanks = (characters: CharacterWithVotes[]): number[] => {
  const ranks: number[] = []
  for (let i = 0; i < characters.length; i++) {
    if (i === 0) {
      ranks.push(1)
    } else if (characters[i].voteCount === characters[i - 1].voteCount) {
      ranks.push(ranks[i - 1])
    } else {
      ranks.push(i + 1)
    }
  }
  return ranks
}

/**
 * 順位ごとのスタイル（バッジ色 / 表彰台リング）
 */
const getRankStyle = (rank: number) => {
  if (rank === 1) {
    return {
      badge: 'bg-rank-gold text-rank-gold-foreground',
      ring: 'ring-2 ring-rank-gold/60',
      Icon: Crown
    }
  }
  if (rank === 2) {
    return {
      badge: 'bg-rank-silver text-rank-silver-foreground',
      ring: 'ring-2 ring-rank-silver/70',
      Icon: Medal
    }
  }
  if (rank === 3) {
    return {
      badge: 'bg-rank-bronze text-rank-bronze-foreground',
      ring: 'ring-2 ring-rank-bronze/60',
      Icon: Medal
    }
  }
  return {
    badge: 'bg-rank-default text-rank-default-foreground',
    ring: '',
    Icon: null
  }
}

/**
 * ランキングカード
 */
const RankingCard = ({ character, rank, index }: { character: CharacterWithVotes; rank: number; index: number }) => {
  const { badge, ring, Icon } = getRankStyle(rank)
  const isPodium = rank <= 3

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, delay: index * 0.05 }}
      className='h-full'
    >
      <div className={cn('h-full flex flex-col border-card rounded-lg p-3 bg-card', ring)}>
        <div className='flex items-center justify-between mb-2'>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full font-bold',
              badge,
              isPodium ? 'h-7 px-3 text-sm' : 'h-6 px-2.5 text-xs'
            )}
          >
            {Icon && <Icon className='h-3.5 w-3.5' />}
            {rank}位
          </span>
        </div>

        <Link
          to='/characters/$id'
          params={{ id: character.id }}
          className='block group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
        >
          <div className='relative bg-page-bg rounded-md h-28 w-full flex items-center justify-center overflow-hidden'>
            <img
              src={character.character?.image_url}
              alt={character.character?.name || ''}
              className='h-full w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-105'
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          <h3
            className='mt-2 text-foreground truncate text-base text-center'
            style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 800 }}
          >
            {character.character?.name}
          </h3>
        </Link>

        <div className='mt-auto pt-2 flex justify-center'>
          <RankingVoteBadge characterId={character.id} voteCount={character.voteCount} />
        </div>
      </div>
    </motion.div>
  )
}

/**
 * 投票ランキングリスト
 */
export const RankingList = ({ characters }: RankingListProps) => {
  const biccameCharacters = characters.filter((c) => c.character?.is_biccame_musume)
  const votedCharacters = biccameCharacters.filter((c) => c.voteCount > 0)
  const allBiccameIds = biccameCharacters.map((c) => c.id)
  const ranks = calculateRanks(votedCharacters)

  return (
    <div className='space-y-6'>
      {allBiccameIds.length > 0 && (
        <div className='flex justify-center py-2'>
          <BulkVoteButton characterIds={allBiccameIds} label='ビッカメ娘全員に投票' />
        </div>
      )}

      {votedCharacters.length === 0 ? (
        <EmptyVoteInfo />
      ) : (
        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4'>
          {votedCharacters.map((character, index) => (
            <RankingCard key={character.id} character={character} rank={ranks[index]} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
