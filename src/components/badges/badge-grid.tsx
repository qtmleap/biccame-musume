import { motion } from 'motion/react'
import { useMemo } from 'react'
import { BadgeCard } from '@/components/badges/badge-card'
import { CLOSED_STORE_KEYS } from '@/data/badges/store-exclusion'
import { BADGE_SUPER_CATEGORY_DEFS } from '@/lib/badge-categories'
import { DURATION } from '@/lib/motion'
import type { Badge, BadgeConditionMeta } from '@/schemas/badge.dto'
import type { StoreKey } from '@/schemas/store.dto'

/** セクションごとに表示する未取得バッジの最大数（多すぎ防止） */
const MAX_UNEARNED_PER_SECTION = 10

const isClosedStoreBadge = (badge: Badge): boolean => {
  try {
    const meta = JSON.parse(badge.condition_meta) as BadgeConditionMeta
    if (meta.storeKey && CLOSED_STORE_KEYS.has(meta.storeKey as StoreKey)) return true
    if (meta.storeKeys?.some((k) => CLOSED_STORE_KEYS.has(k as StoreKey))) return true
    return false
  } catch {
    return false
  }
}

const shuffle = <T,>(arr: T[]): T[] => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

type BadgeGridProps = {
  badges: Badge[]
  earnedMap: Map<string, string>
}

export const BadgeGrid = ({ badges, earnedMap }: BadgeGridProps) => {
  // セクション毎に「獲得済み全件 + 未獲得をランダム最大10件」を計算。
  // useMemo で badges/earnedMap が変わらない間は安定（再 shuffle しない）。
  const sections = useMemo(() => {
    return BADGE_SUPER_CATEGORY_DEFS.map((category) => {
      const earned: Badge[] = []
      const unearnedCandidates: Badge[] = []
      for (const b of badges) {
        if (!category.includes.includes(b.category)) continue
        if (earnedMap.has(b.code)) {
          earned.push(b)
        } else if (!isClosedStoreBadge(b) && b.rarity === 'common') {
          unearnedCandidates.push(b)
        }
      }
      const unearned = shuffle(unearnedCandidates).slice(0, MAX_UNEARNED_PER_SECTION)
      return { category, items: [...earned, ...unearned] }
    })
  }, [badges, earnedMap])

  return (
    <div className='space-y-8'>
      {sections.map(({ category, items }, sectionIdx) => {
        if (items.length === 0) return null

        return (
          <motion.section
            key={category.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.normal, delay: sectionIdx * 0.06 }}
          >
            <header className='mb-3 md:mb-4'>
              <h2 className='text-lg md:text-xl font-bold text-foreground'>{category.label}</h2>
              <p className='text-xs md:text-sm text-muted-foreground mt-0.5'>{category.description}</p>
            </header>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 md:gap-3'>
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
