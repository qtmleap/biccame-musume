import { z } from 'zod'
import { StoreKeySchema } from './store.dto'

/**
 * イベントステータス
 */
export const EventStatusSchema = z.enum(['upcoming', 'ongoing', 'ended'])

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
  id: z.string().uuid(),
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
  id: z.string().uuid(),
  type: ReferenceUrlTypeSchema,
  url: z.url('有効なURLを入力してください')
})

export type ReferenceUrl = z.infer<typeof ReferenceUrlSchema>

/**
 * イベントリクエスト（POST/PUT用）
 */
export const EventSchema = z.object({
  id: z.uuid(),
  // イベント種別
  category: EventCategorySchema,
  // イベント名
  name: z.string().nonempty('イベント名は必須です'),
  // 限定数（任意）
  limitedQuantity: z.number().min(1).optional(),
  // 開始日時
  startDate: z.coerce.date(),
  // 終了予定日時（任意）
  endDate: z.coerce.date().optional(),
  // 実際の終了日時（任意、配布が終了した実際の日時）
  endedAt: z.coerce.date().optional(),
  // 参考URL（任意、複数可）
  referenceUrls: z.array(ReferenceUrlSchema).optional(),
  // 開催店舗（任意、複数可）
  stores: z.array(StoreKeySchema).nonempty(),
  // 配布条件
  conditions: z.array(EventConditionSchema).nonempty('最低1つの条件を設定してください'),
  // 作成日時
  createdAt: z.coerce.date(),
  // 更新日時
  updatedAt: z.coerce.date(),
  // ステータス
  status: EventStatusSchema,
  // 開始までの日数
  daysUntil: z.number()
})

export type Event = z.infer<typeof EventSchema>

/**
 * イベント作成・更新リクエスト（POST/PUT用）
 */
export const EventRequestSchema = EventSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  daysUntil: true
})

export type EventRequest = z.infer<typeof EventRequestSchema>
