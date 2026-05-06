import { z } from '@hono/zod-openapi'
import type { Badge as PrismaBadge } from '@prisma/client'

export const BadgeCategorySchema = z.enum(['store', 'area', 'milestone', 'event', 'event_clear', 'vote', 'special'])

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
  'vote_total',
  'vote_unique',
  'vote_devotion',
  'vote_all_biccame',
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
    name: z.string().nonempty().openapi({ example: 'AKIBA店訪問' }),
    description: z.string().nonempty().openapi({ example: 'ビックカメラAKIBAを訪問しました' }),
    hint: z.string().nonempty().openapi({ example: 'ビックカメラAKIBAを訪問するとゲットできます' }),
    rarity: BadgeRaritySchema.openapi({ example: 'common' }),
    icon_name: z.string().nonempty().openapi({ example: 'MapPin' }),
    sort_order: z.number().int().nonnegative().openapi({ example: 1 }),
    condition_meta: z.string().nonempty().openapi({ description: 'JSON-encoded BadgeConditionMeta' }),
    is_hidden: z.boolean().openapi({ example: false }),
    created_at: z.string().openapi({ example: '2026-05-06T00:00:00.000Z' }),
    updated_at: z.string().openapi({ example: '2026-05-06T00:00:00.000Z' })
  })
  .openapi('Badge')

export type Badge = z.infer<typeof BadgeSchema>

export const BadgeListSchema = z.array(BadgeSchema).openapi('BadgeList')

/**
 * Convert a Prisma Badge row to the BadgeSchema DTO shape.
 */
export const prismaBadgeToDto = (b: PrismaBadge): Badge => ({
  code: b.code,
  category: b.category as Badge['category'],
  sub_category: b.subCategory as Badge['sub_category'],
  name: b.name,
  description: b.description,
  hint: b.hint,
  rarity: b.rarity as Badge['rarity'],
  icon_name: b.iconName,
  sort_order: b.sortOrder,
  condition_meta: b.conditionMeta,
  is_hidden: b.isHidden,
  created_at: b.createdAt.toISOString(),
  updated_at: b.updatedAt.toISOString()
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
