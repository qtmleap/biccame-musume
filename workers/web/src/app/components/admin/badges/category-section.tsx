import { BADGE_CATEGORY_DEFS } from '@biccame/shared/domain/badge-categories'
import type { Badge as BadgeDto } from '@biccame/shared/schemas/badge.dto'
import { motion } from 'motion/react'
import { BadgeCard } from '@/components/admin/badges/badge-card'
import { ACCENT_DOT, ACCENT_TEXT } from '@/components/admin/badges/badge-display-constants'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'

export const CategorySection = ({
  categoryKey,
  badges,
  totalInCategory
}: {
  categoryKey: string
  badges: BadgeDto[]
  totalInCategory: number
}) => {
  const catDef = BADGE_CATEGORY_DEFS.find((d) => d.key === categoryKey)
  const label = catDef?.label ?? categoryKey
  const accent = catDef?.accent ?? 'rank-gold'

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal }}
    >
      <header className='flex items-center justify-between gap-3 mb-3'>
        <div className='flex items-center gap-2 min-w-0'>
          <span aria-hidden className={cn('inline-block size-2.5 rounded-full shrink-0', ACCENT_DOT[accent])} />
          <h2 className={cn('font-bold text-base md:text-lg truncate', ACCENT_TEXT[accent])}>{label}</h2>
        </div>
        <span className='shrink-0 text-xs font-numeric tabular-nums text-muted-foreground'>
          <span className='font-bold text-foreground'>{badges.length}</span>
          {badges.length !== totalInCategory && <span> / {totalInCategory}</span>}
        </span>
      </header>
      <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 md:gap-3'>
        {badges.map((badge, index) => (
          <BadgeCard key={badge.code} badge={badge} index={index} />
        ))}
      </div>
    </motion.section>
  )
}
