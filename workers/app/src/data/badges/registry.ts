import { buildEventCountBadges, buildVoteTotalBadges } from './count-threshold-badges'
import { buildEventClearBadges } from './event-clear-badges'
import type { BadgeDef } from './types'
import { buildVisitBadges } from './visit-badges'

export type { BadgeCategory, BadgeConditionMeta, BadgeDef, BadgeRarity, BadgeSubCategory } from './types'

function getBadgeRegistry(): BadgeDef[] {
  let sortOrder = 0

  const next = () => ++sortOrder

  return [
    ...buildVisitBadges(next),
    ...buildEventCountBadges(next),
    ...buildEventClearBadges(next),
    ...buildVoteTotalBadges(next)
  ]
}

export { getBadgeRegistry }

export const BADGE_REGISTRY: readonly BadgeDef[] = Object.freeze(getBadgeRegistry())

/**
 * code -> registry entry のマップ。フロントで code から name/description/hint を引くのに使う。
 */
export const BADGE_REGISTRY_BY_CODE: ReadonlyMap<string, BadgeDef> = new Map(BADGE_REGISTRY.map((b) => [b.code, b]))

// Registry のサニティチェックは __tests__/badge_registry.test.ts で担保する。
// 以前は module load 時に throw していたが、店舗の増減で全 API が 500 になるリスクがあった。
