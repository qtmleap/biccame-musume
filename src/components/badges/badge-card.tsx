import dayjs from 'dayjs'
import { Lock } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { useBadgeHolders } from '@/hooks/use-badge-holders'
import { resolveBadgeText } from '@/lib/badge-display'
import { getBadgeIcon } from '@/lib/badge-icons'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { BADGE_RARITY_LABELS } from '@/locales/app.content'
import type { Badge, BadgeRarity } from '@/schemas/badge.dto'

type BadgeCardProps = {
  badge: Badge
  earnedAt: string | null
  index: number
}

const RARITY_STYLES: Record<BadgeRarity, { ring: string; glow: string; chip: string }> = {
  common: {
    ring: 'ring-1 ring-border',
    glow: '',
    chip: 'bg-muted text-muted-foreground'
  },
  rare: {
    ring: 'ring-2 ring-status-upcoming',
    glow: 'shadow-[0_0_18px_-4px_var(--status-upcoming)]',
    chip: 'bg-status-upcoming text-status-upcoming-foreground'
  },
  epic: {
    ring: 'ring-2 ring-favorite',
    glow: 'shadow-[0_0_22px_-4px_var(--favorite)]',
    chip: 'bg-favorite text-favorite-foreground'
  },
  legendary: {
    ring: 'ring-2 ring-rank-gold',
    glow: 'shadow-[0_0_28px_-2px_var(--rank-gold)]',
    chip: 'bg-rank-gold text-rank-gold-foreground'
  },
  mythic: {
    ring: 'ring-2 ring-rank-mythic',
    glow: 'shadow-[0_0_36px_-2px_var(--rank-mythic-via)]',
    chip: 'bg-gradient-to-br from-rank-mythic-from via-rank-mythic-via to-rank-mythic-to text-rank-mythic-foreground'
  }
}

export const BadgeCard = ({ badge, earnedAt, index }: BadgeCardProps) => {
  const earned = earnedAt !== null
  const Icon = getBadgeIcon(badge.icon_name)
  const style = RARITY_STYLES[badge.rarity]
  const rotation = earned ? getStickerRotation(index) : 0
  const { name: displayName, description: displayDescription } = resolveBadgeText(badge)
  const [dialogOpen, setDialogOpen] = useState(false)
  const holdersQuery = useBadgeHolders(badge.code, dialogOpen && earned)

  const card = (
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
      className='py-3'
    >
      <motion.div
        style={{ rotate: rotation }}
        whileHover={earned ? { scale: 1.05, rotate: 0 } : { scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={STICKER_HOVER_TRANSITION}
        className={cn(
          'relative rounded-2xl overflow-hidden',
          'flex flex-col items-center justify-center gap-1 px-2 py-3',
          earned ? 'bg-card cursor-pointer' : 'bg-muted/40',
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
            {earned ? displayName : '？？？'}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )

  if (!earned || !earnedAt) {
    return card
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <button type='button' className='block w-full text-left' aria-label={`${displayName ?? 'バッジ'} の詳細を見る`}>
          {card}
        </button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader className='items-center text-center'>
          <div
            className={cn(
              'flex items-center justify-center rounded-full size-20 mb-3',
              style.chip,
              'shadow-inner',
              style.glow
            )}
            aria-hidden
          >
            <Icon className='size-10' strokeWidth={2.2} />
          </div>
          <span
            className={cn(
              'inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider',
              style.chip
            )}
          >
            {BADGE_RARITY_LABELS[badge.rarity]}
          </span>
          <DialogTitle className='text-lg md:text-xl mt-2'>{displayName ?? 'バッジ'}</DialogTitle>
          {displayDescription ? (
            <DialogDescription className='text-sm leading-relaxed'>{displayDescription}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className='mt-2 flex items-center justify-center text-xs text-muted-foreground font-numeric tabular-nums'>
          {dayjs(earnedAt).format('YYYY/MM/DD')} 獲得
        </div>
        <BadgeHoldersSection query={holdersQuery} />
      </DialogContent>
    </Dialog>
  )
}

type HoldersQuery = ReturnType<typeof useBadgeHolders>

const BadgeHoldersSection = ({ query }: { query: HoldersQuery }) => {
  if (query.isLoading) {
    return <div className='mt-4 pt-4 border-t text-center text-xs text-muted-foreground'>獲得者を読み込み中…</div>
  }
  if (query.isError || !query.data) {
    return null
  }
  const { total, holders } = query.data
  return (
    <div className='mt-4 pt-4 border-t'>
      <div className='mb-2 flex items-center justify-between'>
        <div className='text-xs font-bold text-foreground'>獲得者</div>
        <div className='text-xs text-muted-foreground font-numeric tabular-nums'>{total} 人</div>
      </div>
      {holders.length === 0 ? (
        <div className='text-center text-xs text-muted-foreground py-2'>まだ誰も獲得していません</div>
      ) : (
        <ul className='space-y-1.5 max-h-52 overflow-y-auto pr-1'>
          {holders.map((h) => (
            <li key={h.uid} className='flex items-center gap-2'>
              <Avatar className='size-6'>
                {h.thumbnailURL ? <AvatarImage src={h.thumbnailURL} alt='' /> : null}
                <AvatarFallback className='text-[10px]'>{(h.displayName ?? '?').slice(0, 1)}</AvatarFallback>
              </Avatar>
              <span className='text-xs text-foreground truncate flex-1'>{h.displayName ?? '名無しさん'}</span>
              <span className='text-[10px] text-muted-foreground font-numeric tabular-nums shrink-0'>
                {dayjs(h.earnedAt).format('YYYY/MM/DD')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {total > holders.length ? (
        <div className='mt-2 text-center text-[10px] text-muted-foreground'>最初の {holders.length} 人まで表示</div>
      ) : null}
    </div>
  )
}
