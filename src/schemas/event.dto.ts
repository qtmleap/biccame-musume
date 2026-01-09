import dayjs from 'dayjs'
import { z } from 'zod'

/**
 * イベントステータス
 */
export const EventStatusSchema = z.enum(['upcoming', 'ongoing', 'ended'])

export type EventStatus = z.infer<typeof EventStatusSchema>

/**
 * イベントステータスの表示名
 */
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  upcoming: '開催前',
  ongoing: '開催中',
  ended: '終了'
}

/**
 * イベント種別（カテゴリ）
 */
export const EventCategorySchema = z.enum(['limited_card', 'regular_card', 'ackey', 'other'])

export type EventCategory = z.infer<typeof EventCategorySchema>

/**
 * イベント種別の表示名
 */
export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  limited_card: '限定名刺',
  regular_card: '通年名刺',
  ackey: 'アクキー',
  other: 'その他'
}

/**
 * 配布条件の種類
 */
export const EventConditionTypeSchema = z.enum(['purchase', 'first_come', 'lottery', 'everyone'])

export type EventConditionType = z.infer<typeof EventConditionTypeSchema>

/**
 * 配布条件の詳細
 */
export const EventConditionSchema = z.object({
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
 * 参考URLの種類の表示名（短縮版：編集画面用）
 */
export const REFERENCE_URL_TYPE_LABELS: Record<ReferenceUrlType, string> = {
  announce: '告知',
  start: '開始',
  end: '終了'
}

/**
 * 参考URLの種類の表示名（詳細版：詳細ページ用）
 */
export const REFERENCE_URL_TYPE_LABELS_LONG: Record<ReferenceUrlType, string> = {
  announce: '告知ツイート',
  start: '開始ツイート',
  end: '終了ツイート'
}

/**
 * 参考URL
 */
export const ReferenceUrlSchema = z.object({
  type: ReferenceUrlTypeSchema,
  url: z.url('有効なURLを入力してください')
})

export type ReferenceUrl = z.infer<typeof ReferenceUrlSchema>

/**
 * イベント（ベーススキーマ）
 */
const EventBaseSchema = z.object({
  id: z.string(),
  // イベント種別
  category: EventCategorySchema,
  // イベント名
  name: z.string().nonempty('イベント名は必須です'),
  // 参考URL（任意、複数可）
  referenceUrls: z.array(ReferenceUrlSchema).optional(),
  // 開催店舗（任意、複数可）
  stores: z.array(z.string()).nonempty(),
  // 限定数（任意）
  limitedQuantity: z.number().min(1).optional(),
  // 開始日時
  startDate: z.string().datetime(),
  // 終了予定日時（任意）
  endDate: z.string().datetime().optional(),
  // 実際の終了日時（任意、配布が終了した実際の日時）
  actualEndDate: z.string().datetime().optional(),
  // 配布条件
  conditions: z.array(EventConditionSchema).nonempty('最低1つの条件を設定してください'),
  // 作成日時
  createdAt: z.string().datetime(),
  // 更新日時
  updatedAt: z.string().datetime()
})

/**
 * イベント（status付き）
 */
export const EventSchema = EventBaseSchema.transform((v) => {
  const now = dayjs()
  const startDate = dayjs(v.startDate)

  const status: EventStatus = (() => {
    if (now.isBefore(startDate)) return EventStatusSchema.enum.upcoming
    if (v.actualEndDate === undefined || v.endDate === undefined) return EventStatusSchema.enum.ongoing
    return EventStatusSchema.enum.ongoing
  })()

  return { ...v, status }
})

export type Event = z.infer<typeof EventSchema>

/**
 * イベント作成リクエスト
 */
export const CreateEventRequestSchema = EventBaseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
})

export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>

/**
 * イベント更新リクエスト
 */
export const UpdateEventRequestSchema = CreateEventRequestSchema.partial()

export type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>

// 後方互換性のためのエイリアス
export const AckeyCampaignSchema = EventSchema
export type AckeyCampaign = Event
export const AckeyCampaignConditionTypeSchema = EventConditionTypeSchema
export type AckeyCampaignConditionType = EventConditionType
export const AckeyCampaignConditionSchema = EventConditionSchema
export type AckeyCampaignCondition = EventCondition
export const CreateAckeyCampaignRequestSchema = CreateEventRequestSchema
export type CreateAckeyCampaignRequest = CreateEventRequest
export const UpdateAckeyCampaignRequestSchema = UpdateEventRequestSchema
export type UpdateAckeyCampaignRequest = UpdateEventRequest
