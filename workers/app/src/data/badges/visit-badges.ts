import { BADGE_TEMPLATES } from '@/locales/app.content'
import { formatTemplate } from '@/utils/template'
import { BADGE_AREA_LABELS } from './area-mapping'
import { ALL_AREAS, milestoneSteps, type SortOrderCounter, STORES_BY_AREA } from './generation-helpers'
import { STORE_DISPLAY_NAMES } from './store-display-names'
import { ACTIVE_PHYSICAL_STORE_KEYS, PHYSICAL_STORE_KEYS } from './store-exclusion'
import type { BadgeDef, BadgeRarity } from './types'

// Rarity for store visit milestones by accumulated count.
function visitMilestoneRarity(count: number): BadgeRarity {
  if (count <= 10) return 'common'
  if (count <= 25) return 'rare'
  if (count <= 35) return 'epic'
  return 'legendary'
}

export function buildVisitBadges(next: SortOrderCounter): BadgeDef[] {
  const badges: BadgeDef[] = []

  // -----------------------------------------------------------------------
  // 1. Store visit badges (~50)
  // -----------------------------------------------------------------------
  for (const storeKey of PHYSICAL_STORE_KEYS) {
    const storeName = STORE_DISPLAY_NAMES[storeKey]
    const t = BADGE_TEMPLATES.storeVisit
    badges.push({
      code: `store_visit_${storeKey}`,
      category: 'store',
      subCategory: 'visit',
      name: formatTemplate(t.name, { storeName }),
      description: formatTemplate(t.description, { storeName }),
      hint: formatTemplate(t.hint, { storeName }),
      rarity: 'common',
      iconName: 'MapPin',
      sortOrder: next(),
      conditionMeta: { storeKey }
    })
  }

  // -----------------------------------------------------------------------
  // 2. Area visit badges — area_any (10) + area_complete (10)
  // -----------------------------------------------------------------------
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const t = BADGE_TEMPLATES.areaAny
    badges.push({
      code: `area_any_${area}`,
      category: 'area',
      subCategory: 'area_any',
      name: formatTemplate(t.name, { areaLabel }),
      description: formatTemplate(t.description, { areaLabel }),
      hint: formatTemplate(t.hint, { areaLabel }),
      rarity: 'common',
      iconName: 'Navigation',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }
  for (const area of ALL_AREAS) {
    const areaLabel = BADGE_AREA_LABELS[area]
    const storeCount = STORES_BY_AREA[area].length
    const t = BADGE_TEMPLATES.areaComplete
    badges.push({
      code: `area_complete_${area}`,
      category: 'area',
      subCategory: 'area_complete',
      name: formatTemplate(t.name, { areaLabel, storeCount }),
      description: formatTemplate(t.description, { areaLabel, storeCount }),
      hint: formatTemplate(t.hint, { areaLabel, storeCount }),
      rarity: 'rare',
      iconName: 'Trophy',
      sortOrder: next(),
      conditionMeta: { region: area }
    })
  }

  // -----------------------------------------------------------------------
  // 3. Store visit milestone badges
  // -----------------------------------------------------------------------
  // milestone / conquest 系の閾値は現役店舗数を上限にする。
  // 閉店店舗ぶんの過去訪問はカウント側では加算されるが（寛大側）、
  // 「N 店舗中 N 到達で mythic」の N が現役数を超えると永久未達になるのを防ぐ。
  const physicalCount = ACTIVE_PHYSICAL_STORE_KEYS.length
  const visitSteps = milestoneSteps(physicalCount)
  for (let i = 0; i < visitSteps.length; i++) {
    const count = visitSteps[i]
    const rarity = visitMilestoneRarity(count)
    const t = BADGE_TEMPLATES.visitMilestone
    badges.push({
      code: `milestone_visit_count_${count}`,
      category: 'milestone',
      subCategory: 'count',
      name: formatTemplate(t.name, { count }),
      description: formatTemplate(t.description, { count }),
      hint: formatTemplate(t.hint, { count }),
      rarity,
      iconName: 'Star',
      sortOrder: next(),
      conditionMeta: { count }
    })
  }
  // "All stores" completion badge
  const visitAllT = BADGE_TEMPLATES.visitMilestoneAll
  badges.push({
    code: 'milestone_visit_count_all',
    category: 'conquest',
    subCategory: 'count',
    name: formatTemplate(visitAllT.name, { totalStores: physicalCount }),
    description: formatTemplate(visitAllT.description, { totalStores: physicalCount }),
    hint: formatTemplate(visitAllT.hint, { totalStores: physicalCount }),
    rarity: 'mythic',
    iconName: 'Crown',
    sortOrder: next(),
    conditionMeta: { count: physicalCount }
  })
  // "All areas visited" meta badge
  const visitAreasT = BADGE_TEMPLATES.visitAllAreas
  badges.push({
    code: 'milestone_visit_areas',
    category: 'conquest',
    subCategory: 'all_areas_any_visit',
    name: visitAreasT.name,
    description: visitAreasT.description,
    hint: visitAreasT.hint,
    rarity: 'epic',
    iconName: 'Globe',
    sortOrder: next(),
    conditionMeta: {}
  })

  return badges
}
