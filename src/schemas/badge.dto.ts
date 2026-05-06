import { z } from '@hono/zod-openapi'
import type { Badge as PrismaBadge } from '@prisma/client'
import { StoreKeySchema } from '@/schemas/store.dto'

export const BadgeCategorySchema = z.enum([
  'store',
  'area',
  'milestone',
  'event',
  'event_clear_store',
  'event_clear_area',
  'vote',
  'special'
])

export type BadgeCategory = z.infer<typeof BadgeCategorySchema>

export const BadgeSubCategorySchema = z.enum([
  'visit',
  'area_any',
  'area_complete',
  'count',
  'event_count',
  'event_clear_at_store',
  'event_clear_area_any',
  'event_clear_area_complete',
  'event_clear_count',
  'event_clear_all',
  'all_areas_any_visit',
  'all_areas_any_event_clear',
  'vote_total',
  'special_multi_store_clear',
  'special_event_id'
])

export type BadgeSubCategory = z.infer<typeof BadgeSubCategorySchema>

export const BadgeRaritySchema = z.enum(['common', 'rare', 'epic', 'legendary'])

export type BadgeRarity = z.infer<typeof BadgeRaritySchema>

export const BadgeConditionMetaSchema = z
  .object({
    storeKey: z.string().optional(),
    region: z.string().optional(),
    count: z.number().int().positive().optional(),
    storeKeys: z.array(z.string()).optional(),
    eventId: z.string().optional()
  })
  .openapi('BadgeConditionMeta')

export type BadgeConditionMeta = z.infer<typeof BadgeConditionMetaSchema>

export const BadgeSchema = z
  .object({
    code: z.string().nonempty().openapi({ example: 'store_visit_akiba' }),
    category: BadgeCategorySchema.openapi({ example: 'store' }),
    sub_category: BadgeSubCategorySchema.openapi({ example: 'visit' }),
    // 未取得バッジではネタバレ防止のため name/description/hint は返さない（admin と取得済みのみ含む）
    name: z.string().nonempty().optional().openapi({ example: 'AKIBA店訪問' }),
    description: z.string().nonempty().optional().openapi({ example: 'ビックカメラAKIBAを訪問しました' }),
    hint: z.string().nonempty().optional().openapi({ example: 'ビックカメラAKIBAを訪問するとゲットできます' }),
    rarity: BadgeRaritySchema.openapi({ example: 'common' }),
    icon_name: z.string().nonempty().openapi({ example: 'MapPin' }),
    sort_order: z.number().int().nonnegative().openapi({ example: 1 }),
    condition_meta: z.string().nonempty().openapi({ description: 'JSON-encoded BadgeConditionMeta' }),
    is_hidden: z.boolean().openapi({ example: false }),
    created_at: z.string().openapi({ example: '2026-05-06T00:00:00.000Z' }),
    updated_at: z.string().openapi({ example: '2026-05-06T00:00:00.000Z' }),
    earned_count: z.number().int().nonnegative().optional().openapi({
      description: '獲得者数 (admin 専用、includeHidden=1 のときのみ)',
      example: 42
    })
  })
  .openapi('Badge')

export type Badge = z.infer<typeof BadgeSchema>

export const BadgeListSchema = z.array(BadgeSchema).openapi('BadgeList')

/**
 * Convert a Prisma Badge row to the BadgeSchema DTO shape.
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

export const UserBadgeSchema = z
  .object({
    id: z.string().uuid().openapi({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
    user_id: z.string().nonempty().openapi({ example: 'firebase-uid-xyz' }),
    badge_code: z.string().nonempty().openapi({ example: 'store_visit_akiba' }),
    earned_at: z.string().openapi({ example: '2026-05-06T12:00:00.000Z' })
  })
  .openapi('UserBadge')

export type UserBadge = z.infer<typeof UserBadgeSchema>

export const UserBadgeListSchema = z.array(UserBadgeSchema).openapi('UserBadgeList')

export const MyBadgesResponseSchema = z
  .object({
    earned: z.array(
      z.object({
        code: z.string().nonempty().openapi({ example: 'store_visit_akiba' }),
        earnedAt: z.string().openapi({ example: '2026-05-06T12:00:00.000Z' })
      })
    )
  })
  .openapi('MyBadgesResponse')

export type MyBadgesResponse = z.infer<typeof MyBadgesResponseSchema>

export const BadgeDefSchema = z
  .object({
    code: z.string().nonempty().openapi({ example: 'store_visit_akiba' }),
    category: BadgeCategorySchema,
    subCategory: BadgeSubCategorySchema,
    name: z.string().nonempty(),
    description: z.string().nonempty(),
    hint: z.string().nonempty(),
    rarity: BadgeRaritySchema,
    iconName: z.string().nonempty(),
    sortOrder: z.number().int().nonnegative(),
    conditionMeta: BadgeConditionMetaSchema
  })
  .openapi('BadgeDef')

export type BadgeDefDto = z.infer<typeof BadgeDefSchema>

export const LeaderboardEntrySchema = z
  .object({
    uid: z.string().nonempty().openapi({ example: 'firebase-uid-xyz' }),
    displayName: z.string().nullable().openapi({ example: 'あきばたん' }),
    thumbnailURL: z.string().nullable().optional().openapi({ example: 'https://example.com/avatar.png' }),
    earnedCount: z.number().int().nonnegative().openapi({ example: 42 }),
    rank: z.number().int().positive().openapi({ example: 1 })
  })
  .openapi('LeaderboardEntry')

export const BadgeLeaderboardResponseSchema = z
  .object({
    top: z.array(LeaderboardEntrySchema),
    me: z
      .object({
        rank: z.number().int().positive().openapi({ example: 7 }),
        earnedCount: z.number().int().nonnegative().openapi({ example: 15 })
      })
      .optional()
  })
  .openapi('BadgeLeaderboardResponse')

export type BadgeLeaderboardResponse = z.infer<typeof BadgeLeaderboardResponseSchema>

export const GetBadgesQuerySchema = z
  .object({
    includeHidden: z.enum(['1', 'true']).optional().openapi({ example: '1' })
  })
  .openapi('GetBadgesQuery')

export const GetBadgesResponseSchema = z
  .object({
    badges: z.array(BadgeSchema)
  })
  .openapi('GetBadgesResponse')

export type GetBadgesResponse = z.infer<typeof GetBadgesResponseSchema>

export const EarnedBadgeSchema = z
  .object({
    code: z.string().openapi({ example: 'store_visit_akiba' }),
    earnedAt: z.string().openapi({ example: '2026-05-06T12:00:00.000Z' })
  })
  .openapi('EarnedBadge')

export type EarnedBadge = z.infer<typeof EarnedBadgeSchema>

export const GetMyBadgesResponseSchema = MyBadgesResponseSchema

export const MeRankSchema = z
  .object({
    rank: z.number().int().positive().openapi({ example: 7 }),
    earnedCount: z.number().int().nonnegative().openapi({ example: 15 })
  })
  .openapi('MeRank')

export type MeRank = z.infer<typeof MeRankSchema>

export const GetBadgeLeaderboardQuerySchema = z
  .object({
    uid: z.string().optional().openapi({ example: 'firebase-uid-xyz' })
  })
  .openapi('GetBadgeLeaderboardQuery')

export const GetBadgeLeaderboardResponseSchema = BadgeLeaderboardResponseSchema

// ---------------------------------------------------------------------------
// Admin CRUD schemas
// ---------------------------------------------------------------------------

const SpecialConditionMetaSchema = z.union([
  z.object({ storeKeys: z.array(StoreKeySchema).min(1) }),
  z.object({ eventId: z.string().uuid() })
])

export const CreateSpecialBadgeBodySchema = z
  .object({
    name: z.string().min(1).max(50).openapi({ example: '新宿コラボ達成' }),
    description: z.string().min(1).max(200).openapi({ example: '新宿 3 店舗すべてでイベントを達成しました' }),
    hint: z.string().min(1).max(200).openapi({ example: '新宿 3 店舗のイベントをすべて完了するとゲットできます' }),
    rarity: BadgeRaritySchema.openapi({ example: 'epic' }),
    icon_name: z.string().min(1).max(40).openapi({ example: 'Star' }),
    sort_order: z.number().int().nonnegative().default(0).openapi({ example: 0 }),
    sub_category: z
      .enum(['special_multi_store_clear', 'special_event_id'])
      .openapi({ example: 'special_multi_store_clear' }),
    condition_meta: SpecialConditionMetaSchema
  })
  .openapi('CreateSpecialBadgeBody')

export type CreateSpecialBadgeBody = z.infer<typeof CreateSpecialBadgeBodySchema>

export const UpdateBadgeBodySchema = z
  .object({
    name: z.string().min(1).max(50).optional().openapi({ example: '新宿コラボ達成' }),
    description: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .openapi({ example: '新宿 3 店舗すべてでイベントを達成しました' }),
    hint: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .openapi({ example: '新宿 3 店舗のイベントをすべて完了するとゲットできます' }),
    rarity: BadgeRaritySchema.optional().openapi({ example: 'epic' }),
    icon_name: z.string().min(1).max(40).optional().openapi({ example: 'Star' }),
    sort_order: z.number().int().nonnegative().optional().openapi({ example: 0 }),
    is_hidden: z.boolean().optional().openapi({ example: false }),
    sub_category: z
      .enum(['special_multi_store_clear', 'special_event_id'])
      .optional()
      .openapi({ example: 'special_multi_store_clear' }),
    condition_meta: SpecialConditionMetaSchema.optional()
  })
  .openapi('UpdateBadgeBody')

export type UpdateBadgeBody = z.infer<typeof UpdateBadgeBodySchema>

export const AdminBadgeResponseSchema = BadgeSchema

export const AdminDeleteBadgeParamsSchema = z
  .object({
    code: z.string().nonempty().openapi({ example: 'special_ab12cd34' })
  })
  .openapi('AdminDeleteBadgeParams')

export const AdminBadgeParamsSchema = z
  .object({
    code: z.string().nonempty().openapi({ example: 'special_ab12cd34' })
  })
  .openapi('AdminBadgeParams')
