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
      ring: 'ring-2 ring-rank-gold/70',
      Icon: Crown,
      bar: 'bg-rank-gold',
      gradient: 'bg-gradient-to-b from-rank-gold/20 via-card to-card',
      glow: 'shadow-xl shadow-rank-gold/40',
      medalRing: 'ring-rank-gold'
    }
  }
  if (rank === 2) {
    return {
      badge: 'bg-rank-silver text-rank-silver-foreground',
      ring: 'ring-2 ring-rank-silver/70',
      Icon: Medal,
      bar: 'bg-rank-silver',
      gradient: 'bg-gradient-to-b from-rank-silver/25 via-card to-card',
      glow: 'shadow-lg shadow-rank-silver/30',
      medalRing: 'ring-rank-silver'
    }
  }
  if (rank === 3) {
    return {
      badge: 'bg-rank-bronze text-rank-bronze-foreground',
      ring: 'ring-2 ring-rank-bronze/70',
      Icon: Medal,
      bar: 'bg-rank-bronze',
      gradient: 'bg-gradient-to-b from-rank-bronze/20 via-card to-card',
      glow: 'shadow-lg shadow-rank-bronze/30',
      medalRing: 'ring-rank-bronze'
    }
  }
  return {
    badge: 'bg-rank-default text-rank-default-foreground',
    ring: '',
    Icon: null,
    bar: 'bg-favorite/60',
    gradient: '',
    glow: '',
    medalRing: ''
  }
}

type CardProps = {
  character: CharacterWithVotes
  rank: number
  index: number
  maxVote: number
  size?: 'sm' | 'md' | 'lg'
}

/**
 * 上位3位の豪華カード
 */
const PodiumCard = ({ character, rank, index, maxVote, size = 'md' }: CardProps) => {
  const { ring, Icon, bar, gradient, glow, medalRing, badge } = getRankStyle(rank)
  const percent = maxVote > 0 ? Math.max(4, Math.round((character.voteCount / maxVote) * 100)) : 0

  const isFirst = rank === 1
  const imageHeight = size === 'lg' ? 'h-36 md:h-44' : 'h-28 md:h-32'
  const titleSize = size === 'lg' ? 'text-lg md:text-xl' : 'text-base md:text-lg'
  const medalSize = size === 'lg' ? 'h-12 w-12 md:h-14 md:w-14' : 'h-10 w-10 md:h-12 md:w-12'
  const iconSize = size === 'lg' ? 'h-5 w-5 md:h-6 md:w-6' : 'h-4 w-4 md:h-5 md:w-5'

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, delay: index * 0.08, type: 'spring', stiffness: 120 }}
      className='relative h-full pt-6 md:pt-7'
    >
      {/* フロートメダル */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: DURATION.slow, delay: 0.3 + index * 0.08, type: 'spring', stiffness: 200 }}
        className='absolute left-1/2 top-0 -translate-x-1/2 z-10'
      >
        <div
          className={cn('flex items-center justify-center rounded-full bg-card ring-4 shadow-lg', medalSize, medalRing)}
        >
          <span className={cn('flex items-center justify-center rounded-full w-full h-full', badge)}>
            {Icon && <Icon className={cn(iconSize)} strokeWidth={2.4} />}
          </span>
        </div>
        {isFirst && (
          <motion.span
            aria-hidden
            className='absolute -inset-2 rounded-full bg-rank-gold/30 -z-10'
            animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          />
        )}
      </motion.div>

      <div
        className={cn(
          'h-full flex flex-col rounded-xl p-3 pt-7 md:pt-8 relative overflow-hidden',
          ring,
          glow,
          gradient || 'bg-card'
        )}
      >
        {/* 順位ラベル */}
        <div className='text-center mb-1'>
          <span
            className={cn(
              'inline-block tabular-nums tracking-wide font-bold',
              isFirst ? 'text-xl md:text-2xl' : 'text-base md:text-lg'
            )}
            style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 900 }}
          >
            {rank}
            <span className='text-xs md:text-sm ml-0.5 font-bold'>位</span>
          </span>
        </div>

        <Link
          to='/characters/$id'
          params={{ id: character.id }}
          className='block group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
        >
          <div
            className={cn(
              'relative bg-page-bg rounded-md w-full flex items-center justify-center overflow-hidden',
              imageHeight
            )}
          >
            <img
              src={character.character?.image_url}
              alt={character.character?.name || ''}
              className='h-full w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-105'
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          <h3
            className={cn('mt-2 text-foreground truncate text-center', titleSize)}
            style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 800 }}
          >
            {character.character?.name}
          </h3>
        </Link>

        <div className='mt-2'>
          <div className='h-1.5 w-full rounded-full bg-vote-count overflow-hidden'>
            <motion.div
              className={cn('h-full rounded-full', bar)}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: DURATION.slow, delay: 0.4 + index * 0.05, ease: 'easeOut' }}
            />
          </div>
        </div>

        <div className='mt-2 flex justify-center'>
          <RankingVoteBadge characterId={character.id} voteCount={character.voteCount} />
        </div>
      </div>
    </motion.div>
  )
}

/**
 * 4位以降の横長行リスト
 */
const RankingRow = ({ character, rank, index, maxVote }: CardProps) => {
  const { badge, bar } = getRankStyle(rank)
  const percent = maxVote > 0 ? Math.max(4, Math.round((character.voteCount / maxVote) * 100)) : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DURATION.normal, delay: index * 0.03 }}
    >
      <div className='flex items-center gap-3 md:gap-4 border-card rounded-lg bg-card px-3 py-2.5 hover:bg-button-surface-hover transition-colors'>
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full font-bold tabular-nums shrink-0',
            badge,
            'h-7 w-7 md:h-8 md:w-8 text-xs md:text-sm'
          )}
        >
          {rank}
        </span>

        <Link
          to='/characters/$id'
          params={{ id: character.id }}
          className='flex items-center gap-3 flex-1 min-w-0 group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
        >
          <div className='relative bg-page-bg rounded-full h-12 w-12 md:h-14 md:w-14 flex items-center justify-center overflow-hidden shrink-0'>
            <img
              src={character.character?.image_url}
              alt={character.character?.name || ''}
              className='h-full w-auto max-w-none scale-150 translate-y-[15%] object-contain transition-transform duration-300 group-hover:scale-[1.6]'
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          <div className='flex-1 min-w-0'>
            <h3
              className='text-foreground truncate text-sm md:text-base'
              style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 800 }}
            >
              {character.character?.name}
            </h3>
            <div className='mt-1 h-1.5 w-full rounded-full bg-vote-count overflow-hidden'>
              <motion.div
                className={cn('h-full rounded-full', bar)}
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: DURATION.slow, delay: 0.1 + index * 0.02, ease: 'easeOut' }}
              />
            </div>
          </div>
        </Link>

        <div className='shrink-0'>
          <RankingVoteBadge characterId={character.id} voteCount={character.voteCount} />
        </div>
      </div>
    </motion.div>
  )
}

/**
 * 上位3位の表彰台ブロック（2位左 / 1位中央(大) / 3位右）
 */
const Podium = ({ top3, ranks, maxVote }: { top3: CharacterWithVotes[]; ranks: number[]; maxVote: number }) => {
  // 配置: 2位を左、1位を中央、3位を右に並べる（同率の場合は元順序）
  const byRank = (target: number) => {
    const idx = ranks.findIndex((r) => r === target)
    return idx >= 0 ? { character: top3[idx], rank: ranks[idx], index: idx } : null
  }

  const first = byRank(1)
  const second = byRank(2)
  const third = byRank(3)

  return (
    <div className='grid grid-cols-3 gap-2 md:gap-4 items-end'>
      <div className='pt-6 md:pt-10'>{second && <PodiumCard {...second} maxVote={maxVote} size='md' />}</div>
      <div className='pt-0'>{first && <PodiumCard {...first} maxVote={maxVote} size='lg' />}</div>
      <div className='pt-10 md:pt-16'>{third && <PodiumCard {...third} maxVote={maxVote} size='md' />}</div>
    </div>
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
  const maxVote = votedCharacters[0]?.voteCount ?? 0

  // 上位3位（同率対応：rank<=3 のものを集める）
  const podiumIndices = ranks.map((r, i) => (r <= 3 ? i : -1)).filter((i) => i >= 0)
  const restIndices = ranks.map((_, i) => i).filter((i) => !podiumIndices.includes(i))

  const podiumChars = podiumIndices.map((i) => votedCharacters[i])
  const podiumRanks = podiumIndices.map((i) => ranks[i])

  return (
    <div className='space-y-8'>
      {allBiccameIds.length > 0 && (
        <div className='flex justify-center'>
          <BulkVoteButton characterIds={allBiccameIds} label='ビッカメ娘全員に投票' />
        </div>
      )}

      {votedCharacters.length === 0 ? (
        <EmptyVoteInfo />
      ) : (
        <div className='space-y-8'>
          <Podium top3={podiumChars} ranks={podiumRanks} maxVote={maxVote} />

          {restIndices.length > 0 && (
            <>
              <div className='h-px bg-separator/60' />
              <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3'>
                {restIndices.map((i, j) => (
                  <RankingRow
                    key={votedCharacters[i].id}
                    character={votedCharacters[i]}
                    rank={ranks[i]}
                    index={j}
                    maxVote={maxVote}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
