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
  name: z.string().nonempty('イベント名は必須です'),
  stores: z.array(StoreKeySchema).nonempty('最低1つの店舗を選択してください'),
  startDate: z.string().nonempty('開始日は必須です'),
  endDate: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  limitedQuantity: z.number().min(1).optional(),
  referenceUrls: z.array(ReferenceUrlSchema),
  conditions: z.array(EventConditionSchema).min(1, '最低1つの条件を設定してください'),
  isVerified: z.boolean(),
  isPreliminary: z.boolean(),
  shouldTweet: z.boolean()
})

// クエリパラメータから新規作成する
export const EventRequestQuerySchema = z.object({})

export type EventRequest = z.infer<typeof EventRequestSchema>
