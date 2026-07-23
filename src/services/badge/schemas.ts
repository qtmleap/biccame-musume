import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import type { BadgeArea } from '@/data/badges/area-mapping'
import type { BadgeConditionMeta } from '@/data/badges/registry'
import { StoreKeySchema } from '@/schemas/store.dto'
import type { Bindings } from '@/types/bindings'

/**
 * バッジ評価関数の共通 context。
 * env は push 送信で必要、prisma は判定で必要、userId は判定の主体。
 */
export type EvaluatorContext = {
  env: Bindings
  prisma: PrismaClient
  userId: string
}

/**
 * バッジエリアの全列挙。判定順序に依存する箇所は少ないが、テストと `all_areas_*` 系で
 * イテレーションに使うので明示的に固定順で持つ。
 */
export const ALL_BADGE_AREAS = [
  'hokkaido',
  'kanto_north',
  'chiba',
  'tokyo_metro',
  'shinjuku_shibuya',
  'ikebukuro',
  'kanagawa',
  'chubu',
  'sanyo_kinki',
  'kyushu'
] as const satisfies readonly BadgeArea[]

export const BadgeAreaSchema = z.enum(ALL_BADGE_AREAS)

// sub_category ごとの conditionMeta スキーマ。
// バッジ評価時に raw JSON をこのスキーマで parse することで、ランタイム検証と型 narrow を同時に行う。

export const StoreKeyMetaSchema = z.object({ storeKey: StoreKeySchema })
export const AreaMetaSchema = z.object({ region: BadgeAreaSchema })
export const CountMetaSchema = z.object({ count: z.number().int().positive() })
export const EventClearAtStoreMetaSchema = z.object({
  storeKey: StoreKeySchema,
  count: z.number().int().positive().optional()
})
export const StoreKeysMetaSchema = z.object({ storeKeys: z.array(StoreKeySchema).min(1) })
export const EventIdMetaSchema = z.object({ eventId: z.string().nonempty() })

/**
 * conditionMeta の汎用スキーマ。BadgeConditionMeta 型をそのまま Zod で写したもの。
 * evaluateBadge の初回 parse や、sub_category を跨いだフィルタリングで使う。
 */
export const badgeConditionMetaSchema: z.ZodType<BadgeConditionMeta> = z.object({
  storeKey: StoreKeySchema.optional(),
  region: BadgeAreaSchema.optional(),
  count: z.number().int().positive().optional(),
  storeKeys: z.array(StoreKeySchema).default([]),
  eventId: z.string().nonempty().optional()
})
