import { motion } from 'motion/react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { BadgeLeaderboardResponse } from '@/schemas/badge.dto'

type BadgeLeaderboardProps = {
  leaderboard: BadgeLeaderboardResponse
  myUid?: string
}

const RANK_COLOR = (rank: number) => {
  if (rank === 1) return 'text-rank-gold'
  if (rank === 2) return 'text-rank-silver'
  if (rank === 3) return 'text-rank-bronze'
  return 'text-muted-foreground'
}

export const BadgeLeaderboard = ({ leaderboard, myUid }: BadgeLeaderboardProps) => {
  const { top } = leaderboard

  return (
    <section className='space-y-3'>
      <header className='px-1'>
        <h2 className='font-bold text-base md:text-lg text-foreground'>達成リーダーボード</h2>
      </header>

      <div className='bg-card border border-card-border rounded-2xl divide-y divide-border overflow-hidden'>
        {top.map((entry, i) => {
          const isMe = entry.uid === myUid
          const displayName = entry.displayName ?? 'ユーザー'
          return (
            <motion.div
              key={entry.uid}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.fast, delay: i * 0.025 }}
              className={cn(
                'flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3',
                isMe && 'bg-rank-gold/10 ring-1 ring-rank-gold/40'
              )}
            >
              <span
                className={cn(
                  'shrink-0 font-numeric font-black tabular-nums w-8 text-center text-2xl md:text-3xl',
                  RANK_COLOR(entry.rank)
                )}
                style={{ letterSpacing: '-0.06em' }}
              >
                {entry.rank}
              </span>

              <Avatar className='size-9 md:size-10 shrink-0'>
                <AvatarFallback className='bg-brand/10 text-brand text-sm font-bold'>
                  {displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>

              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2'>
                  <span className='truncate font-bold text-sm md:text-base text-foreground'>{displayName}</span>
                  {isMe && (
                    <span className='shrink-0 text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded-full bg-rank-gold text-rank-gold-foreground'>
                      YOU
                    </span>
                  )}
                </div>
              </div>

              <div className='shrink-0 text-right'>
                <div className='font-numeric font-black tabular-nums text-base md:text-lg text-foreground leading-none'>
                  {entry.earnedCount}
                </div>
                <div className='text-[10px] text-muted-foreground'>個</div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
