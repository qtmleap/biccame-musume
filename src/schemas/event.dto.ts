import dayjs from 'dayjs'
import { z } from 'zod'

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
  type: ReferenceUrlTypeSchema,
  url: z.url('有効なURLを入力してください')
})

export type ReferenceUrl = z.infer<typeof ReferenceUrlSchema>

/**
 * イベントリクエスト（POST/PUT用）
 */
export const EventRequestSchema = z.object({
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
  startDate: z.iso.datetime(),
  // 終了予定日時（任意）
  endDate: z.iso.datetime().optional(),
  // 実際の終了日時（任意、配布が終了した実際の日時）
  endedAt: z.iso.datetime().optional(),
  // 配布条件
  conditions: z.array(EventConditionSchema).nonempty('最低1つの条件を設定してください')
})

export type EventRequest = z.infer<typeof EventRequestSchema>

/**
 * イベントレスポンス（GET用、status・daysUntil付き）
 */
export const EventSchema = EventRequestSchema.extend({
  id: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
}).transform((v) => {
  const currentTime = dayjs()
  const startDate = dayjs(v.startDate)

  const status: EventStatus = (() => {
    if (currentTime.isBefore(startDate)) return EventStatusSchema.enum.upcoming
    // 実際の終了日時が設定されていたら終了済み
    if (v.endedAt !== undefined) return EventStatusSchema.enum.ended
    if (v.endDate !== undefined)
      return currentTime.isAfter(v.endDate) ? EventStatusSchema.enum.ended : EventStatusSchema.enum.ongoing
    return EventStatusSchema.enum.ongoing
  })()

  // 日本時間で日付の差分を計算
  const daysUntil = startDate.startOf('day').diff(currentTime.startOf('day'), 'day')

  return { ...v, status, daysUntil }
})

export type Event = z.infer<typeof EventSchema>
