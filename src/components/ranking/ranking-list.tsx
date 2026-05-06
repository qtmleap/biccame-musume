import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { BulkVoteButton } from '@/components/characters/bulk-vote-button'
import { RankingVoteBadge } from '@/components/ranking/ranking-vote-badge'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW, STICKER_SHADOW_SM } from '@/lib/sticker'
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
 * 順位ごとのバー色
 */
const getBarClass = (rank: number) => {
  if (rank === 1) return 'bg-rank-gold'
  if (rank === 2) return 'bg-rank-silver'
  if (rank === 3) return 'bg-rank-bronze'
  return 'bg-favorite/60'
}

type CardProps = {
  character: CharacterWithVotes
  rank: number
  index: number
  maxVote: number
  /** 紙の傾き（degrees）。未指定なら順位ごとの既定、0 で傾きなし。 */
  rotation?: number
}

/**
 * 上位3位のステッカー風カード
 */
const PodiumCard = ({ character, rank, index, maxVote, rotation }: CardProps) => {
  const percent = maxVote > 0 ? Math.max(4, Math.round((character.voteCount / maxVote) * 100)) : 0
  const isFirst = rank === 1
  const isSecond = rank === 2

  // 紙の傾き（degrees）：1位=+1、2位=-3、3位=+2
  const defaultPodiumRotation = isFirst ? 1 : isSecond ? -3 : 2
  const rotationDeg = rotation ?? defaultPodiumRotation
  // 紙の縁
  const cardBorder =
    rank === 1 ? 'border-2 border-yellow-200' : isSecond ? 'border border-zinc-200' : 'border border-orange-200'
  // 順位ナンバー色
  const numColor = rank === 1 ? 'text-rank-gold' : isSecond ? 'text-rank-silver' : 'text-rank-bronze'

  const imageHeight = isFirst ? 'h-36 md:h-44' : 'h-28 md:h-32'
  const titleSize = isFirst ? 'text-xl' : 'text-base md:text-lg'
  const numSize = isFirst ? 'text-5xl md:text-6xl' : 'text-3xl md:text-4xl'
  const padding = isFirst ? 'p-4' : 'p-3'

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, delay: index * 0.08, type: 'spring', stiffness: 120 }}
      className='h-full'
      style={{ filter: STICKER_SHADOW }}
    >
      <motion.div
        className='h-full'
        style={{ rotate: rotationDeg }}
        whileHover={{ scale: isFirst ? 1.04 : 1.05, rotate: 0 }}
        whileTap={{ scale: 0.98 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <div
          className={cn(
            'relative h-full flex flex-col bg-card',
            cardBorder,
            isFirst ? 'rounded-3xl' : 'rounded-2xl',
            padding
          )}
        >
          {/* マスキングテープ */}
          {rank === 1 && (
            <>
              <div aria-hidden className='absolute -top-3 left-4 w-14 h-5 bg-yellow-300/80 -rotate-6 rounded-sm' />
              <div aria-hidden className='absolute -top-3 right-6 w-10 h-4 bg-pink-200/80 rotate-[5deg] rounded-sm' />
              <div aria-hidden className='absolute -right-3 top-2 text-rank-gold text-2xl rotate-12 select-none'>
                ★
              </div>
            </>
          )}
          {isSecond && (
            <div aria-hidden className='absolute -top-2 left-3 w-12 h-4 bg-zinc-300/70 -rotate-[8deg] rounded-sm' />
          )}
          {rank === 3 && (
            <div aria-hidden className='absolute -top-2 right-3 w-12 h-4 bg-orange-300/70 rotate-[7deg] rounded-sm' />
          )}

          <Link
            to='/characters/$id'
            params={{ id: character.id }}
            className='block group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
          >
            <div
              className={cn(
                'relative bg-page-bg w-full flex items-center justify-center overflow-hidden',
                isFirst ? 'rounded-2xl' : 'rounded-xl',
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
          </Link>

          <div className='flex items-baseline justify-between gap-2 mt-3'>
            <span
              className={cn('font-numeric font-black tabular-nums leading-none shrink-0', numColor, numSize)}
              style={{ letterSpacing: '-0.06em' }}
            >
              {rank}
            </span>
            <div className='text-right min-w-0 flex-1'>
              <h3 className={cn('font-bold truncate text-foreground', titleSize)}>{character.character?.name}</h3>
              {isFirst && <div className='text-[10px] tracking-[0.3em] text-muted-foreground'>CHAMPION</div>}
            </div>
          </div>

          <div className='mt-3'>
            <div className={cn('rounded-full bg-vote-count overflow-hidden', isFirst ? 'h-2' : 'h-1.5')}>
              <motion.div
                className={cn('h-full rounded-full', getBarClass(rank))}
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: DURATION.slow, delay: 0.4 + index * 0.05, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className='mt-3 flex justify-center'>
            <RankingVoteBadge characterId={character.id} voteCount={character.voteCount} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// 4位以降のステッカー装飾を index でデコレーションする
const ROW_TAPES: ({ side: 'left' | 'right'; color: string; angle: string } | null)[] = [
  { side: 'left', color: 'bg-yellow-200/80', angle: '-rotate-[12deg]' },
  { side: 'right', color: 'bg-pink-200/80', angle: 'rotate-[10deg]' },
  { side: 'left', color: 'bg-blue-200/80', angle: '-rotate-[8deg]' },
  null,
  { side: 'right', color: 'bg-green-200/80', angle: 'rotate-[8deg]' },
  null
]

/**
 * 4位以降のステッカー横長行
 */
const RankingRow = ({ character, rank, index, maxVote, rotation }: CardProps) => {
  const percent = maxVote > 0 ? Math.max(4, Math.round((character.voteCount / maxVote) * 100)) : 0
  const rotationDeg = getStickerRotation(index, rotation)
  const tape = ROW_TAPES[index % ROW_TAPES.length]

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DURATION.normal, delay: index * 0.03 }}
      style={{ filter: STICKER_SHADOW_SM }}
    >
      <motion.div
        style={{ rotate: rotationDeg }}
        whileHover={{ scale: 1.03, rotate: 0 }}
        whileTap={{ scale: 0.98 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <div className='relative bg-card rounded-xl border border-zinc-200 dark:border-card-border p-3 flex items-center gap-3'>
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

          <span
            className={cn(
              'font-numeric font-black tabular-nums w-8 text-center shrink-0 text-3xl text-muted-foreground',
              getBarClass(rank).startsWith('bg-rank') && 'text-foreground'
            )}
            style={{ letterSpacing: '-0.06em' }}
          >
            {rank}
          </span>

          <Link
            to='/characters/$id'
            params={{ id: character.id }}
            className='flex items-center gap-3 flex-1 min-w-0 group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
          >
            <div className='relative bg-page-bg rounded-full h-14 w-14 flex items-center justify-center overflow-hidden shrink-0'>
              <img
                src={character.character?.image_url}
                alt={character.character?.name || ''}
                className='h-full w-auto max-w-none scale-150 translate-y-[15%] object-contain transition-transform duration-300 group-hover:scale-[1.6]'
                style={{ mixBlendMode: 'multiply' }}
              />
            </div>
            <div className='flex-1 min-w-0'>
              <h3 className='font-bold text-foreground truncate text-sm md:text-base'>{character.character?.name}</h3>
              <div className='mt-1 h-1.5 w-full rounded-full bg-vote-count overflow-hidden'>
                <motion.div
                  className={cn('h-full rounded-full', getBarClass(rank))}
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
    </motion.div>
  )
}

/**
 * 上位3位の表彰台ブロック（2位左 / 1位中央(大) / 3位右）
 */
const Podium = ({ top3, ranks, maxVote }: { top3: CharacterWithVotes[]; ranks: number[]; maxVote: number }) => {
  const byRank = (target: number) => {
    const idx = ranks.findIndex((r) => r === target)
    return idx >= 0 ? { character: top3[idx], rank: ranks[idx], index: idx } : null
  }

  const first = byRank(1)
  const second = byRank(2)
  const third = byRank(3)

  return (
    <div className='grid grid-cols-3 gap-4 md:gap-6 items-end'>
      <div className='pt-10 md:pt-12'>{second && <PodiumCard {...second} maxVote={maxVote} />}</div>
      <div className='pt-0'>{first && <PodiumCard {...first} maxVote={maxVote} />}</div>
      <div className='pt-12 md:pt-16'>{third && <PodiumCard {...third} maxVote={maxVote} />}</div>
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
        <>
          {/* デスクトップ: 表彰台 + 4位以降グリッド */}
          <div className='hidden md:block space-y-10'>
            <Podium top3={podiumChars} ranks={podiumRanks} maxVote={maxVote} />

            {restIndices.length > 0 && (
              <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4'>
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
            )}
          </div>

          {/* モバイル: 全件リスト */}
          <div className='md:hidden space-y-3'>
            {votedCharacters.map((c, i) => (
              <RankingRow key={c.id} character={c} rank={ranks[i]} index={i} maxVote={maxVote} rotation={0} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
