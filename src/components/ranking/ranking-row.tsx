import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { RankingVoteBadge } from '@/components/ranking/ranking-vote-badge'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { type CardProps, getBarClass } from './ranking-list-helpers'

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
export const RankingRow = ({ character, rank, index, maxVote, rotation }: CardProps) => {
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
