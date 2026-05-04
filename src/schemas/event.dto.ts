import { z } from 'zod'
import { StoreKeySchema } from './store.dto'
/**
 * イベントステータス
 */
export const EventStatusSchema = z.enum(['upcoming', 'ongoing', 'last_day', 'ended'], {
  error: 'イベントステータスが不正です'
})

export type EventStatus = z.infer<typeof EventStatusSchema>

/**
 * イベント種別（カテゴリ）
 */
export const EventCategorySchema = z.enum(['limited_card', 'regular_card', 'ackey', 'other'], {
  error: 'イベント種別を選択してください'
})

export type EventCategory = z.infer<typeof EventCategorySchema>

/**
 * 配布条件の種類
 */
export const EventConditionTypeSchema = z.enum(['purchase', 'first_come', 'lottery', 'everyone'], {
  error: '配布条件の種類を選択してください'
})

export type EventConditionType = z.infer<typeof EventConditionTypeSchema>

/**
 * 配布条件の詳細
 */
export const EventConditionSchema = z.object({
  uuid: z.uuid(),
  type: EventConditionTypeSchema,
  // 購入条件の場合の金額（円）
  purchaseAmount: z
    .number({ error: '金額は数値で入力してください' })
    .min(0, '金額は 0 円以上で入力してください')
    .optional(),
  // 先着または抽選の人数
  quantity: z.number({ error: '人数は数値で入力してください' }).min(1, '人数は 1 人以上で入力してください').optional()
})

/**
 * 参考URLの種類
 */
export const ReferenceUrlTypeSchema = z.enum(['announce', 'start', 'end'], {
  error: 'URL の種類を選択してください'
})

export type ReferenceUrlType = z.infer<typeof ReferenceUrlTypeSchema>

/**
 * 参考URL
 */
export const ReferenceUrlSchema = z.object({
  uuid: z.uuid(),
  type: ReferenceUrlTypeSchema,
  url: z.url('有効なURLを入力してください')
})

/**
 * イベント作成・更新リクエスト（GET/PUT/POST用）
 */
export const EventRequestSchema = z.object({
  uuid: z.uuid(),
  category: EventCategorySchema,
  title: z.string().nonempty('イベント名は必須です'),
  stores: z.array(StoreKeySchema).nonempty('最低 1 つの店舗を選択してください'),
  startDate: z.string().nonempty('開始日は必須です'),
  endDate: z.string().optional(),
  endedAt: z.string().optional(),
  limitedQuantity: z
    .number({ error: '配布数は数値で入力してください' })
    .min(1, '配布数は 1 以上で入力してください')
    .optional(),
  referenceUrls: z.array(ReferenceUrlSchema).nonempty('最低 1 つの参考 URL を入力してください'),
  conditions: z.array(EventConditionSchema).min(1, '最低 1 つの配布条件を設定してください'),
  isVerified: z.boolean(),
  isPreliminary: z.boolean(),
  shouldTweet: z.boolean()
})
export type EventRequest = z.infer<typeof EventRequestSchema>

/**
 * クエリパラメータによるイベント作成のバリデーション
 */
export const EventRequestQuerySchema = z.object({
  category: EventCategorySchema.optional(),
  title: z.string().nonempty('イベント名は必須です').optional(),
  stores: z.string().nonempty('店舗は必須です').optional(),
  startDate: z.string().nonempty('開始日は必須です').optional(),
  endDate: z.string().nonempty('終了日は必須です').optional(),
  endAt: z.string().nonempty('終了日時は必須です').optional(),
  referenceUrls: z.url().optional()
})
export type EventRequestQuery = z.infer<typeof EventRequestQuerySchema>

/**
 * イベント（API レスポンス用）
 */
export const EventSchema = z.object({
  uuid: z.uuid(),
  category: EventCategorySchema,
  title: z.string().nonempty('イベント名は必須です'),
  stores: z.array(StoreKeySchema).nonempty('最低 1 つの店舗を選択してください'),
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
  interestedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export type Event = z.infer<typeof EventSchema>

/**
 * イベント統計リクエストスキーマ
 */
export const EventStatsRequestSchema = z.object({
  eventIds: z.array(z.string().nonempty('イベントIDは必須です')).nonempty('イベントIDを最低 1 つ指定してください')
})

/**
 * イベント統計レスポンススキーマ
 */
export const EventStatsResponseSchema = z.record(
  z.string().nonempty(),
  z.object({
    interestedCount: z.number(),
    completedCount: z.number()
  })
)

/**
 * URL重複チェックレスポンススキーマ
 */
export const CheckUrlResponseSchema = z.object({
  exists: z.boolean(),
  event: EventSchema.optional()
})
