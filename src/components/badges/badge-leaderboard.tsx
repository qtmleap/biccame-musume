import { motion } from 'motion/react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { LeaderboardEntry } from '@/data/badges.mock'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'

type BadgeLeaderboardProps = {
  entries: LeaderboardEntry[]
  totalBadges: number
}

const RANK_COLOR = (rank: number) => {
  if (rank === 1) return 'text-rank-gold'
  if (rank === 2) return 'text-rank-silver'
  if (rank === 3) return 'text-rank-bronze'
  return 'text-muted-foreground'
}

const RANK_BAR = (rank: number) => {
  if (rank === 1) return 'bg-rank-gold'
  if (rank === 2) return 'bg-rank-silver'
  if (rank === 3) return 'bg-rank-bronze'
  return 'bg-favorite/60'
}

/**
 * 達成リーダーボード
 */
export const BadgeLeaderboard = ({ entries, totalBadges }: BadgeLeaderboardProps) => {
  const top = entries[0]
  const maxCount = top?.earnedCount ?? totalBadges

  return (
    <section className='space-y-3'>
      <header className='flex items-end justify-between gap-3 px-1'>
        <h2 className='font-bold text-base md:text-lg text-foreground'>達成リーダーボード</h2>
        <span className='text-xs text-muted-foreground'>獲得バッジ数で集計</span>
      </header>

      <div className='bg-card border border-card-border rounded-2xl divide-y divide-border overflow-hidden'>
        {entries.map((entry, i) => {
          const percent = maxCount > 0 ? Math.round((entry.earnedCount / maxCount) * 100) : 0
          return (
            <motion.div
              key={entry.uid}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.fast, delay: i * 0.025 }}
              className={cn(
                'flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3',
                entry.isMe && 'bg-rank-gold/10 ring-1 ring-rank-gold/40'
              )}
            >
              {/* 順位 */}
              <span
                className={cn(
                  'shrink-0 font-numeric font-black tabular-nums w-8 text-center text-2xl md:text-3xl',
                  RANK_COLOR(entry.rank)
                )}
                style={{ letterSpacing: '-0.06em' }}
              >
                {entry.rank}
              </span>

              {/* アバター */}
              <Avatar className='size-9 md:size-10 shrink-0'>
                <AvatarFallback className='bg-brand/10 text-brand text-sm font-bold'>
                  {entry.displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>

              {/* 名前 + バー */}
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2'>
                  <span
                    className={cn(
                      'truncate font-bold text-sm md:text-base',
                      entry.isMe ? 'text-foreground' : 'text-foreground'
                    )}
                  >
                    {entry.displayName}
                  </span>
                  {entry.isMe && (
                    <span className='shrink-0 text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded-full bg-rank-gold text-rank-gold-foreground'>
                      YOU
                    </span>
                  )}
                  {entry.title && !entry.isMe && (
                    <span className='shrink-0 truncate text-[10px] text-muted-foreground'>{entry.title}</span>
                  )}
                </div>
                <div className='mt-1 h-1.5 w-full rounded-full bg-vote-count overflow-hidden'>
                  <motion.div
                    className={cn('h-full rounded-full', RANK_BAR(entry.rank))}
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: DURATION.slow, delay: 0.1 + i * 0.02, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* 獲得数 */}
              <div className='shrink-0 text-right'>
                <div className='font-numeric font-black tabular-nums text-base md:text-lg text-foreground leading-none'>
                  {entry.earnedCount}
                  <span className='text-xs text-muted-foreground'> / {totalBadges}</span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
