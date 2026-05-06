import { motion } from 'motion/react'
import { BadgeCard } from '@/components/badges/badge-card'
import { BADGE_CATEGORY_DEFS } from '@/lib/badge-categories'
import { DURATION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { Badge } from '@/schemas/badge.dto'

type BadgeGridProps = {
  badges: Badge[]
  earnedMap: Map<string, string>
}

const ACCENT_TEXT: Record<string, string> = {
  'rank-gold': 'text-rank-gold',
  favorite: 'text-favorite',
  brand: 'text-brand',
  'category-limited-card-solid': 'text-category-limited-card-solid',
  'rank-bronze': 'text-rank-bronze'
}

const ACCENT_DOT: Record<string, string> = {
  'rank-gold': 'bg-rank-gold',
  favorite: 'bg-favorite',
  brand: 'bg-brand',
  'category-limited-card-solid': 'bg-category-limited-card-solid',
  'rank-bronze': 'bg-rank-bronze'
}

export const BadgeGrid = ({ badges, earnedMap }: BadgeGridProps) => {
  return (
    <div className='space-y-8'>
      {BADGE_CATEGORY_DEFS.map((category, sectionIdx) => {
        const items = badges.filter((b) => b.category === category.key)
        if (items.length === 0) return null
        const earnedInCategory = items.filter((b) => earnedMap.has(b.code)).length

        return (
          <motion.section
            key={category.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.normal, delay: sectionIdx * 0.06 }}
          >
            <header className='flex items-end justify-between gap-3 mb-3'>
              <div className='flex items-center gap-2 min-w-0'>
                <span aria-hidden className={cn('inline-block size-2.5 rounded-full', ACCENT_DOT[category.accent])} />
                <h2 className={cn('font-bold text-base md:text-lg truncate', ACCENT_TEXT[category.accent])}>
                  {category.label}
                </h2>
                <span className='text-[10px] md:text-xs text-muted-foreground truncate'>{category.description}</span>
              </div>
              <span className='shrink-0 text-xs font-numeric tabular-nums text-muted-foreground'>
                <span className='font-bold text-foreground'>{earnedInCategory}</span> / {items.length}
              </span>
            </header>

            <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 md:gap-3'>
              {items.map((badge, i) => (
                <BadgeCard key={badge.code} badge={badge} earnedAt={earnedMap.get(badge.code) ?? null} index={i} />
              ))}
            </div>
          </motion.section>
        )
      })}
    </div>
  )
}
