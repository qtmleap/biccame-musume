import { CommentResponseSchema } from '@biccame/shared/schemas/comment.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { z } from 'zod'
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
export const EventCategorySchema = z.enum(['limited_card', 'regular_card', 'ackey', 'acsta', 'other'], {
  error: 'イベント種別を選択してください'
})

export type EventCategory = z.infer<typeof EventCategorySchema>

/**
 * 配布条件の種類
 */
export const EventConditionTypeSchema = z.enum(['purchase', 'charge', 'first_come', 'lottery', 'everyone'], {
  error: '配布条件の種類を選択してください'
})

export type EventConditionType = z.infer<typeof EventConditionTypeSchema>

/**
 * 配布条件の詳細
 */
export const EventConditionSchema = z
  .object({
    uuid: z.uuid(),
    type: EventConditionTypeSchema,
    // 購入条件の場合の金額（円）
    purchaseAmount: z
      .number({ error: '金額は数値で入力してください' })
      .min(0, '金額は 0 円以上で入力してください')
      .optional(),
    // 入金・チャージ条件の場合の金額（円）。商品購入とは区別する。
    chargeAmount: z
      .number({ error: '金額は数値で入力してください' })
      .int('金額は整数で入力してください')
      .min(0, '金額は 0 円以上で入力してください')
      .optional(),
    // 先着または抽選の人数
    quantity: z.number({ error: '人数は数値で入力してください' }).min(1, '人数は 1 人以上で入力してください').optional()
  })
  // 入金額は入金条件だけに持たせ、購入額との混在を防ぐ。未判定の省略は許容する。
  .refine((condition) => condition.type === 'charge' || condition.chargeAmount === undefined, {
    path: ['chargeAmount'],
    message: '入金・チャージ額は入金条件にのみ指定できます'
  })
  .refine((condition) => condition.type !== 'charge' || condition.purchaseAmount === undefined, {
    path: ['purchaseAmount'],
    message: '入金条件に商品購入額は指定できません'
  })

/**
 * 参考URLの種類
 */
export const ReferenceUrlTypeSchema = z.enum(['announce', 'start', 'end'], {
  error: 'URL の種類を選択してください'
})

export type ReferenceUrlType = z.infer<typeof ReferenceUrlTypeSchema>

/**
 * 特殊な対象ビッカメ娘。
 * - other: 特定の娘に紐付かないイベント
 * - secret: 対象が伏せられているイベント
 */
export const SpecialCharacterSchema = z.enum(['other', 'secret'], {
  error: '対象ビッカメ娘が不正です'
})

export type SpecialCharacter = z.infer<typeof SpecialCharacterSchema>

/**
 * イベントの対象ビッカメ娘。店舗キーまたは特殊値
 */
export const EventCharacterSchema = z.union([StoreKeySchema, SpecialCharacterSchema], {
  error: '対象ビッカメ娘が不正です'
})

export type EventCharacter = z.infer<typeof EventCharacterSchema>

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
  endDate: z.string().nonempty('終了日は必須です').optional(),
  endedAt: z.string().nonempty('終了日時は必須です').optional(),
  limitedQuantity: z
    .number({ error: '配布数は数値で入力してください' })
    .min(1, '配布数は 1 以上で入力してください')
    .optional(),
  referenceUrls: z.array(ReferenceUrlSchema).nonempty('最低 1 つの参考 URL を入力してください'),
  conditions: z.array(EventConditionSchema).min(1, '最低 1 つの配布条件を設定してください'),
  isVerified: z.boolean(),
  isPreliminary: z.boolean(),
  // 所属するイベントグループの UUID（任意）
  groupId: z.uuid('グループ ID は UUID 形式で指定してください').optional(),
  // 対象ビッカメ娘。空配列は未判定であり、開催店舗から補完しない。
  characterIds: z.array(EventCharacterSchema),
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
  characterIds: z.string().nonempty('対象ビッカメ娘を指定してください').optional(),
  startDate: z.string().nonempty('開始日は必須です').optional(),
  endDate: z.string().nonempty('終了日は必須です').optional(),
  endAt: z.string().nonempty('終了日時は必須です').optional(),
  referenceUrls: z.url().optional(),
  from: z.uuid().optional(),
  // 受信履歴の詳細から開いたとき、作成したイベントを紐付ける受信ジョブ（投稿 ID と、複数候補の投稿では候補の UUID）
  webhookPostId: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  webhookCandidateId: z.uuid().optional()
})
export type EventRequestQuery = z.infer<typeof EventRequestQuerySchema>

/**
 * イベント（API レスポンス用・一覧）
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
  conditions: z.array(EventConditionSchema),
  isVerified: z.boolean(),
  isPreliminary: z.boolean(),
  // 所属するイベントグループの UUID（任意）
  groupId: z.string().optional(),
  // 対象ビッカメ娘。空配列は未判定であり、開催店舗から補完しない。
  characterIds: z.array(EventCharacterSchema),
  status: EventStatusSchema,
  daysUntil: z.number(),
  interestedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export type Event = z.infer<typeof EventSchema>

/**
 * イベント詳細（API レスポンス用・単件）
 * 一覧スキーマに referenceUrls と comments を追加
 */
export const EventDetailSchema = EventSchema.extend({
  referenceUrls: z.array(ReferenceUrlSchema),
  comments: z.array(CommentResponseSchema)
})

export type EventDetail = z.infer<typeof EventDetailSchema>

/**
 * イベント統計リクエストスキーマ
 */
export const EventStatsRequestSchema = z.object({
  eventIds: z
    .array(z.string().nonempty('イベントIDは必須です').max(100))
    .transform((ids) => [...new Set(ids)])
    .pipe(z.array(z.string()).max(50, 'イベントIDは最大50件まで指定できます'))
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
