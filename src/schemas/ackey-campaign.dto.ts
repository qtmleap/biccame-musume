import { z } from 'zod'

/**
 * イベント種別（カテゴリ）
 */
export const EventCategorySchema = z.enum(['limited_card', 'ackey', 'other'])

export type EventCategory = z.infer<typeof EventCategorySchema>

/**
 * イベント種別の表示名
 */
export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  limited_card: '限定名刺',
  ackey: 'アクキー',
  other: 'その他'
}

/**
 * アクキー配布条件の種類
 */
export const AckeyCampaignConditionTypeSchema = z.enum(['purchase', 'first_come', 'lottery', 'everyone'])

export type AckeyCampaignConditionType = z.infer<typeof AckeyCampaignConditionTypeSchema>

/**
 * アクキー配布条件の詳細
 */
export const AckeyCampaignConditionSchema = z.object({
  type: AckeyCampaignConditionTypeSchema,
  // 購入条件の場合の金額（円）
  purchaseAmount: z.number().min(0).optional(),
  // 先着または抽選の人数
  quantity: z.number().min(1).optional()
})

export type AckeyCampaignCondition = z.infer<typeof AckeyCampaignConditionSchema>

/**
 * 参考URLの種類
 */
export const ReferenceUrlTypeSchema = z.enum(['announce', 'start', 'end'])

export type ReferenceUrlType = z.infer<typeof ReferenceUrlTypeSchema>

/**
 * 参考URLの種類の表示名
 */
export const REFERENCE_URL_TYPE_LABELS: Record<ReferenceUrlType, string> = {
  announce: '告知',
  start: '開始',
  end: '終了'
}

/**
 * 参考URL
 */
export const ReferenceUrlSchema = z.object({
  type: ReferenceUrlTypeSchema,
  url: z.string().url('有効なURLを入力してください')
})

export type ReferenceUrl = z.infer<typeof ReferenceUrlSchema>

/**
 * アクキー配布キャンペーン
 */
export const AckeyCampaignSchema = z.object({
  id: z.string(),
  // イベント種別
  category: EventCategorySchema,
  // キャンペーン名
  name: z.string().min(1, 'キャンペーン名は必須です'),
  // 参考URL（任意、複数可）
  referenceUrls: z.array(ReferenceUrlSchema).optional(),
  // 開催店舗（任意、複数可）
  stores: z.array(z.string()).optional(),
  // 限定数（任意）
  limitedQuantity: z.number().min(1).optional(),
  // 開始日時
  startDate: z.string().datetime(),
  // 終了予定日時（任意）
  endDate: z.string().datetime().optional(),
  // 実際の終了日時（任意、配布が終了した実際の日時）
  actualEndDate: z.string().datetime().optional(),
  // 配布条件
  conditions: z.array(AckeyCampaignConditionSchema).min(1, '最低1つの条件を設定してください'),
  // 終了済みかどうか（actualEndDateがある場合は自動的にtrue）
  isEnded: z.boolean().default(false),
  // 作成日時
  createdAt: z.string().datetime(),
  // 更新日時
  updatedAt: z.string().datetime()
})

export type AckeyCampaign = z.infer<typeof AckeyCampaignSchema>

/**
 * アクキー配布キャンペーン作成リクエスト
 */
export const CreateAckeyCampaignRequestSchema = AckeyCampaignSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
})

export type CreateAckeyCampaignRequest = z.infer<typeof CreateAckeyCampaignRequestSchema>

/**
 * アクキー配布キャンペーン更新リクエスト
 */
export const UpdateAckeyCampaignRequestSchema = CreateAckeyCampaignRequestSchema.partial()

export type UpdateAckeyCampaignRequest = z.infer<typeof UpdateAckeyCampaignRequestSchema>
