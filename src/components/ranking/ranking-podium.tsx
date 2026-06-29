import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { RankingVoteBadge } from '@/components/ranking/ranking-vote-badge'
import { DURATION } from '@/lib/motion'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { type CardProps, type CharacterWithVotes, getBarClass } from './ranking-list-helpers'

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
  const cardBorder =
    rank === 1 ? 'border-2 border-yellow-200' : isSecond ? 'border border-zinc-200' : 'border border-orange-200'
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

type PodiumProps = {
  top3: CharacterWithVotes[]
  ranks: number[]
  maxVote: number
}

/**
 * 上位3位の表彰台ブロック（2位左 / 1位中央(大) / 3位右）
 */
export const Podium = ({ top3, ranks, maxVote }: PodiumProps) => {
  const byRank = (target: number) => {
    const idx = ranks.indexOf(target)
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
