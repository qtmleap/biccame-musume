import { BADGE_TEMPLATES } from '@/locales/app.content'
import { formatTemplate } from '@/utils/template'
import { BADGE_AREA_LABELS } from './area-mapping'
import { ALL_AREAS, milestoneSteps, type SortOrderCounter, STORES_BY_AREA } from './generation-helpers'
import { STORE_DISPLAY_NAMES } from './store-display-names'
import { ACTIVE_PHYSICAL_STORE_KEYS, PHYSICAL_STORE_KEYS } from './store-exclusion'
import type { BadgeDef, BadgeRarity } from './types'

// Rarity for event clear count milestones, mapped explicitly by threshold.
function eventClearCountRarity(count: number): BadgeRarity {
  if (count <= 10) return 'common'
  if (count <= 20) return 'rare'
  if (count <= 30) return 'epic'
  return 'legendary'
}

export function buildEventClearBadges(next: SortOrderCounter): BadgeDef[] {
  const badges: BadgeDef[] = []

  // -----------------------------------------------------------------------
  // 5. Per-store event clear badges (50 stores × 3 thresholds = 150)
  //
  // Thresholds: 1 (common), 5 (rare), 10 (epic).
  // count=1 は既存コード `event_clear_at_store_${storeKey}` を維持。
  // -----------------------------------------------------------------------
  const EVENT_CLEAR_AT_STORE_TIERS: { count: number; rarity: BadgeRarity }[] = [
    { count: 1, rarity: 'common' },
    { count: 5, rarity: 'rare' },
    { count: 10, rarity: 'epic' }
  ]
  for (const tier of EVENT_CLEAR_AT_STORE_TIERS) {
    const isFirst = tier.count === 1
    const t = isFirst ? BADGE_TEMPLATES.eventClearAtStore : BADGE_TEMPLATES.eventClearAtStoreMultiple
    for (const storeKey of PHYSICAL_STORE_KEYS) {
      const storeName = STORE_DISPLAY_NAMES[storeKey]
      const code = isFirst ? `event_clear_at_store_${storeKey}` : `event_clear_at_store_${storeKey}_${tier.count}`
      const vars = { storeName, count: tier.count }
      badges.push({
        code,
        category: 'event_clear_store',
        subCategory: 'event_clear_at_store',
        name: formatTemplate(t.name, vars),
        description: formatTemplate(t.description, vars),
        hint: formatTemplate(t.hint, vars),
        rarity: tier.rarity,
        iconName: 'MapPinCheck',
        sortOrder: next(),
        conditionMeta: { storeKey, ...(isFirst ? {} : { count: tier.count }) }
      })
    }
  }

  // -----------------------------------------------------------------------
  // 6. Area event clear badges — area_any (10) + area_complete (10)
  // -----------------------------------------------------------------------
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const t = BADGE_TEMPLATES.eventClearAreaAny
    badges.push({
      code: `event_clear_area_any_${area}`,
      category: 'event_clear_area',
      subCategory: 'event_clear_area_any',
      name: formatTemplate(t.name, { areaLabel }),
      description: formatTemplate(t.description, { areaLabel }),
      hint: formatTemplate(t.hint, { areaLabel }),
      rarity: 'rare',
      iconName: 'Compass',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const storeCount = STORES_BY_AREA[area].length
    const t = BADGE_TEMPLATES.eventClearAreaComplete
    badges.push({
      code: `event_clear_area_complete_${area}`,
      category: 'event_clear_area',
      subCategory: 'event_clear_area_complete',
      name: formatTemplate(t.name, { areaLabel, storeCount }),
      description: formatTemplate(t.description, { areaLabel, storeCount }),
      hint: formatTemplate(t.hint, { areaLabel, storeCount }),
      rarity: 'epic',
      iconName: 'Award',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }

  // -----------------------------------------------------------------------
  // 7. Event clear store-count milestone badges
  // -----------------------------------------------------------------------
  // 閾値の上限は現役店舗数。理由は visit-badges.ts の同名定数のコメントを参照。
  const physicalCount = ACTIVE_PHYSICAL_STORE_KEYS.length
  const clearSteps = milestoneSteps(physicalCount)
  for (let i = 0; i < clearSteps.length; i++) {
    const count = clearSteps[i]
    const rarity = eventClearCountRarity(count)
    const t = BADGE_TEMPLATES.clearMilestone
    badges.push({
      code: `milestone_clear_count_${count}`,
      category: 'event',
      subCategory: 'event_clear_count',
      name: formatTemplate(t.name, { count }),
      description: formatTemplate(t.description, { count }),
      hint: formatTemplate(t.hint, { count }),
      rarity,
      iconName: 'Swords',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }
  // "All stores" event clear completion badge
  const clearAllT = BADGE_TEMPLATES.clearMilestoneAll
  badges.push({
    code: 'milestone_clear_count_all',
    category: 'conquest',
    subCategory: 'event_clear_all',
    name: formatTemplate(clearAllT.name, { totalStores: physicalCount }),
    description: formatTemplate(clearAllT.description, { totalStores: physicalCount }),
    hint: formatTemplate(clearAllT.hint, { totalStores: physicalCount }),
    rarity: 'mythic',
    iconName: 'Sparkles',
    sortOrder: next(),
    conditionMeta: { count: physicalCount }
  })
  // "All areas event clear" meta badge
  const clearAreasT = BADGE_TEMPLATES.clearAllAreas
  badges.push({
    code: 'milestone_clear_areas',
    category: 'conquest',
    subCategory: 'all_areas_any_event_clear',
    name: clearAreasT.name,
    description: clearAreasT.description,
    hint: clearAreasT.hint,
    rarity: 'legendary',
    iconName: 'Globe',
    sortOrder: next(),
    conditionMeta: {}
  })

  return badges
}
