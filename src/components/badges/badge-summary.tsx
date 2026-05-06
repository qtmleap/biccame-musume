import type { User } from 'firebase/auth'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getTierFromCount } from '@/data/badges.mock'
import { getLargeTwitterPhoto } from '@/hooks/use-auth'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'

type BadgeSummaryProps = {
  user: User | null
  earnedCount: number
  totalCount: number
  /** 自分のリーダーボード順位 */
  myRank: number
  totalUsers: number
}

const TIER_TONE_BG: Record<string, string> = {
  common: 'bg-muted text-muted-foreground',
  rare: 'bg-status-upcoming text-status-upcoming-foreground',
  epic: 'bg-favorite text-favorite-foreground',
  legendary: 'bg-rank-gold text-rank-gold-foreground'
}

/**
 * 上部の進捗サマリー
 */
export const BadgeSummary = ({ user, earnedCount, totalCount, myRank, totalUsers }: BadgeSummaryProps) => {
  const percent = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0
  const tier = getTierFromCount(earnedCount, totalCount)

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal }}
      className='relative bg-card border border-card-border rounded-3xl p-4 md:p-6 overflow-hidden'
    >
      {/* マスキングテープ装飾 */}
      <div aria-hidden className='absolute -top-3 left-6 w-16 h-5 bg-rank-gold/70 -rotate-6 rounded-sm' />
      <div aria-hidden className='absolute -top-2 right-8 w-10 h-4 bg-pink-200/80 rotate-[5deg] rounded-sm' />

      <div className='flex items-center gap-4'>
        <Avatar className='size-14 md:size-16 ring-2 ring-rank-gold'>
          <AvatarImage src={getLargeTwitterPhoto(user?.photoURL)} alt={user?.displayName ?? 'User'} />
          <AvatarFallback className='bg-brand/10 text-brand text-2xl'>
            {user?.displayName?.charAt(0) ?? 'U'}
          </AvatarFallback>
        </Avatar>

        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <h2 className='text-base md:text-lg font-bold text-foreground truncate'>{user?.displayName ?? 'ゲスト'}</h2>
            <span
              className={cn(
                'text-[10px] md:text-xs font-bold tracking-widest px-2 py-0.5 rounded-full',
                TIER_TONE_BG[tier.tone]
              )}
            >
              {tier.label}
            </span>
          </div>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            ランキング <span className='font-numeric font-bold tabular-nums text-foreground'>#{myRank}</span> /{' '}
            {totalUsers} 人中
          </p>
        </div>

        {/* 大きな % */}
        <div className='text-right shrink-0'>
          <div
            className='font-numeric font-black tabular-nums text-rank-gold leading-none text-4xl md:text-5xl'
            style={{ letterSpacing: '-0.06em' }}
          >
            {percent}
            <span className='text-xl md:text-2xl text-muted-foreground'>%</span>
          </div>
          <div className='mt-1 text-[10px] md:text-xs text-muted-foreground tabular-nums'>
            {earnedCount} / {totalCount} 個
          </div>
        </div>
      </div>

      {/* プログレスバー */}
      <div className='mt-4 h-2 rounded-full bg-vote-count overflow-hidden'>
        <motion.div
          className='h-full rounded-full bg-rank-gold'
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: DURATION.slow, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
    </motion.section>
  )
}
