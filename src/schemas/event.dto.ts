import { z } from 'zod'
import { StoreKeySchema } from './store.dto'
/**
 * イベントステータス
 */
export const EventStatusSchema = z.enum(['upcoming', 'ongoing', 'last_day', 'ended'])

export type EventStatus = z.infer<typeof EventStatusSchema>

/**
 * イベント種別（カテゴリ）
 */
export const EventCategorySchema = z.enum(['limited_card', 'regular_card', 'ackey', 'other'])

export type EventCategory = z.infer<typeof EventCategorySchema>

/**
 * 配布条件の種類
 */
export const EventConditionTypeSchema = z.enum(['purchase', 'first_come', 'lottery', 'everyone'])

export type EventConditionType = z.infer<typeof EventConditionTypeSchema>

/**
 * 配布条件の詳細
 */
export const EventConditionSchema = z.object({
  uuid: z.uuidv4(),
  type: EventConditionTypeSchema,
  // 購入条件の場合の金額（円）
  purchaseAmount: z.number().min(0).optional(),
  // 先着または抽選の人数
  quantity: z.number().min(1).optional()
})

export type EventCondition = z.infer<typeof EventConditionSchema>

/**
 * 参考URLの種類
 */
export const ReferenceUrlTypeSchema = z.enum(['announce', 'start', 'end'])

export type ReferenceUrlType = z.infer<typeof ReferenceUrlTypeSchema>

/**
 * 参考URL
 */
export const ReferenceUrlSchema = z.object({
  uuid: z.uuidv4(),
  type: ReferenceUrlTypeSchema,
  url: z.url('有効なURLを入力してください')
})

export type ReferenceUrl = z.infer<typeof ReferenceUrlSchema>

/**
 * イベント作成・更新リクエスト（GET/PUT/POST用）
 */
export const EventRequestSchema = z.object({
  uuid: z.uuidv4(),
  category: EventCategorySchema,
  title: z.string().nonempty('イベント名は必須です'),
  stores: z.array(StoreKeySchema).nonempty('最低1つの店舗を選択してください'),
  startDate: z.string().nonempty('開始日は必須です'),
  endDate: z.string().optional(),
  endedAt: z.string().optional(),
  limitedQuantity: z.number().min(1).optional(),
  referenceUrls: z.array(ReferenceUrlSchema).nonempty(),
  conditions: z.array(EventConditionSchema).min(1, '最低1つの条件を設定してください'),
  isVerified: z.boolean(),
  isPreliminary: z.boolean(),
  shouldTweet: z.boolean()
})
export type EventRequest = z.infer<typeof EventRequestSchema>

/**
 * クエリパラメータによるイベント作成のバリデーション
 */
export const EventRequestQuerySchema = z.object({
  uuid: z.uuidv4(),
  category: EventCategorySchema,
  title: z.string().optional(),
  stores: z.string().nonempty(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  endAt: z.string().optional(),
  referenceUrls: z.url()
})
export type EventRequestQuery = z.infer<typeof EventRequestQuerySchema>

/**
 * イベント（API レスポンス用）
 */
export const EventSchema = z.object({
  uuid: z.string(),
  category: EventCategorySchema,
  title: z.string(),
  stores: z.array(StoreKeySchema),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
  limitedQuantity: z.number().optional(),
  referenceUrls: z.array(ReferenceUrlSchema),
  conditions: z.array(EventConditionSchema),
  isVerified: z.boolean(),
  isPreliminary: z.boolean(),
  status: EventStatusSchema,
  daysUntil: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export type Event = z.infer<typeof EventSchema>
