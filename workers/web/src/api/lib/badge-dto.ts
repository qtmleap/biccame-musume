import type { Badge as PrismaBadge } from '@api/db/generated/prisma/client'
import type { Badge } from '@biccame/shared/schemas/badge.dto'

/**
 * Prisma のバッジ行を公開 DTO に変換する。
 * `mask=true` のとき name/description/hint を返さない（未取得ユーザー向けのネタバレ防止）
 */
export const prismaBadgeToDto = (b: PrismaBadge, earnedCount?: number, mask = false): Badge => ({
  code: b.code,
  category: b.category as Badge['category'],
  sub_category: b.subCategory as Badge['sub_category'],
  name: mask ? undefined : b.name,
  description: mask ? undefined : b.description,
  hint: mask ? undefined : b.hint,
  rarity: b.rarity as Badge['rarity'],
  icon_name: b.iconName,
  sort_order: b.sortOrder,
  condition_meta: b.conditionMeta,
  is_hidden: b.isHidden,
  created_at: b.createdAt.toISOString(),
  updated_at: b.updatedAt.toISOString(),
  earned_count: earnedCount
})
