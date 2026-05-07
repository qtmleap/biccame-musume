import { BADGE_REGISTRY_BY_CODE } from '@/data/badges/registry'
import type { Badge } from '@/schemas/badge.dto'

/**
 * registry 由来のバッジは registry の name/description/hint を真とする。
 * special など registry に無い code は API レスポンス (DB) のまま使う。
 */
export const resolveBadgeText = (badge: Pick<Badge, 'code' | 'name' | 'description' | 'hint'>) => {
  const entry = BADGE_REGISTRY_BY_CODE.get(badge.code)
  return {
    name: entry?.name ?? badge.name,
    description: entry?.description ?? badge.description,
    hint: entry?.hint ?? badge.hint
  }
}
