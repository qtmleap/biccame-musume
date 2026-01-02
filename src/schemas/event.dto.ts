import { z } from 'zod'

/**
 * イベント商品タイプ
 */
export const EventProductTypeSchema = z.enum(['アクキー'])

export type EventProductType = z.infer<typeof EventProductTypeSchema>

/**
 * イベント条件タイプ
 */
export const EventConditionTypeSchema = z.enum(['3000円以上購入', '先着', '抽選'])

export type EventConditionType = z.infer<typeof EventConditionTypeSchema>

/**
 * イベント条件詳細（人数情報を含む）
 */
export const EventConditionSchema = z.object({
  type: EventConditionTypeSchema,
  limit: z.number().int().positive().optional() // 先着・抽選の場合の人数
})

export type EventCondition = z.infer<typeof EventConditionSchema>

/**
 * イベント情報のスキーマ定義
 */
export const EventSchema = z.object({
  id: z.string().uuid(),
  startDate: z.string(), // YYYY-MM-DD形式
  endDate: z.string().optional(), // YYYY-MM-DD形式
  productType: EventProductTypeSchema,
  storeName: z.string(),
  condition: EventConditionSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})

export type Event = z.infer<typeof EventSchema>

/**
 * イベント作成用のスキーマ（idとタイムスタンプを除外）
 */
export const EventCreateSchema = EventSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
})

export type EventCreate = z.infer<typeof EventCreateSchema>

/**
 * イベント更新用のスキーマ
 */
export const EventUpdateSchema = EventCreateSchema.partial()

export type EventUpdate = z.infer<typeof EventUpdateSchema>

/**
 * イベント一覧のスキーマ
 */
export const EventsSchema = z.array(EventSchema)

export type Events = z.infer<typeof EventsSchema>
