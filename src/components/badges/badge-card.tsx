import { Lock } from 'lucide-react'
import { motion } from 'motion/react'
import { getBadgeIcon } from '@/lib/badge-icons'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import type { Badge, BadgeRarity } from '@/schemas/badge.dto'

type BadgeCardProps = {
  badge: Badge
  earnedAt: string | null
  index: number
}

const RARITY_STYLES: Record<BadgeRarity, { ring: string; glow: string; label: string; chip: string }> = {
  common: {
    ring: 'ring-1 ring-border',
    glow: '',
    label: 'COMMON',
    chip: 'bg-muted text-muted-foreground'
  },
  rare: {
    ring: 'ring-2 ring-status-upcoming',
    glow: 'shadow-[0_0_18px_-4px_var(--status-upcoming)]',
    label: 'RARE',
    chip: 'bg-status-upcoming text-status-upcoming-foreground'
  },
  epic: {
    ring: 'ring-2 ring-favorite',
    glow: 'shadow-[0_0_22px_-4px_var(--favorite)]',
    label: 'EPIC',
    chip: 'bg-favorite text-favorite-foreground'
  },
  legendary: {
    ring: 'ring-2 ring-rank-gold',
    glow: 'shadow-[0_0_28px_-2px_var(--rank-gold)]',
    label: 'LEGENDARY',
    chip: 'bg-rank-gold text-rank-gold-foreground'
  }
}

export const BadgeCard = ({ badge, earnedAt, index }: BadgeCardProps) => {
  const earned = earnedAt !== null
  const Icon = getBadgeIcon(badge.icon_name)
  const style = RARITY_STYLES[badge.rarity]
  const rotation = earned ? getStickerRotation(index) : 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: DURATION.normal,
        delay: index * 0.04,
        type: 'spring',
        stiffness: 140,
        damping: 14
      }}
      style={{ filter: earned ? STICKER_SHADOW_SM : undefined }}
    >
      <motion.div
        style={{ rotate: rotation }}
        whileHover={earned ? { scale: 1.05, rotate: 0 } : { scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={STICKER_HOVER_TRANSITION}
        className={cn(
          'relative rounded-2xl overflow-hidden',
          'flex flex-col items-center justify-center gap-1 px-2 py-3',
          earned ? 'bg-card' : 'bg-muted/40',
          style.ring,
          earned && style.glow
        )}
      >
        <div
          className={cn(
            'relative flex items-center justify-center rounded-full size-14 md:size-16',
            earned ? cn(style.chip, 'shadow-inner') : 'bg-foreground/10'
          )}
          aria-hidden
        >
          {earned ? (
            <Icon className='size-7 md:size-8' strokeWidth={2.2} />
          ) : (
            <Icon className='size-7 md:size-8 text-foreground/20' strokeWidth={2} />
          )}
          {!earned && (
            <span
              role='img'
              aria-label='未獲得'
              className='absolute -bottom-1 -right-1 grid place-items-center rounded-full size-6 bg-card shadow-md ring-1 ring-border'
            >
              <Lock className='size-3.5 text-muted-foreground' />
            </span>
          )}
        </div>

        <div className='mt-1 text-center px-1 leading-tight'>
          <div
            className={cn(
              'font-bold text-xs md:text-sm truncate',
              earned ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {earned ? badge.name : '？？？'}
          </div>
          {!earned && (
            <div className='mt-0.5 text-[10px] md:text-[11px] text-muted-foreground line-clamp-2 min-h-[2.4em]'>
              {badge.hint}
            </div>
          )}
        </div>

        {earned && earnedAt && (
          <div className='mt-0.5 text-[9px] font-numeric tabular-nums text-muted-foreground'>
            {earnedAt.slice(0, 10)}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
