import { ClefModelSchema, ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import {
  DetectionDraftSchema,
  FieldThresholdsSchema,
  WEBHOOK_KEYWORD_VERDICTS
} from '@biccame/shared/event-detect/detection'
import { ItemCountAuditSchema } from '@biccame/shared/event-detect/extraction'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { GapStatusSchema } from '@biccame/shared/event-detect/viewer'
import { EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import { z } from 'zod'
import { WebhookDiscoverySchema, WebhookRelatedEventsSchema } from './webhook-discovery.dto'

export { type WebhookDiscovery, WebhookDiscoverySchema } from './webhook-discovery.dto'

// 版ごとの不変な定義と、判定ごとの実入力を区別する。
export const WebhookPromptDefinitionSchema = z.object({
  questionVersion: z.string().nonempty(),
  origin: z.string().nonempty(),
  stateTemplate: z.string().nonempty(),
  questions: z.array(
    z.object({
      key: z.string().nonempty(),
      type: z.enum(['noul', 'choice', 'score']),
      instructions: z.string().nonempty(),
      criteria: z.record(z.string().nonempty(), z.string().nonempty())
    })
  ),
  dynamicCriteria: z.string().nonempty()
})
export type WebhookPromptDefinition = z.infer<typeof WebhookPromptDefinitionSchema>
export const WebhookPromptSchema = z.object({
  questionVersion: z.string().nonempty().nullable(),
  requests: z.array(ClefRequestSchema),
  source: z.enum(['recorded', 'definition', 'unavailable']),
  definition: WebhookPromptDefinitionSchema.nullable()
})
export type WebhookPrompt = z.infer<typeof WebhookPromptSchema>

export const WebhookJobStatusSchema = z.enum(['queued', 'processing', 'held', 'registered', 'ignored', 'failed'])
export const WebhookNotificationStatusSchema = z.enum(['pending', 'sent', 'failed', 'unknown', 'skipped'])
export const WebhookQueueMessageSchema = z.strictObject({ postId: z.string().regex(/^\d{1,20}$/) })
export type WebhookQueueMessage = z.infer<typeof WebhookQueueMessageSchema>

export const WebhookJobFieldsSchema = z.object({
  postId: z.string().regex(/^\d{1,20}$/),
  post: DetectPostSchema,
  sourceUrl: z.url(),
  eventUUID: z.uuid(),
  status: WebhookJobStatusSchema,
  reasons: z.array(z.string().nonempty()),
  candidate: EventRequestSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  model: z.string().nonempty().nullable(),
  questionVersion: z.string().nonempty().nullable(),
  eventId: z.uuid().nullable(),
  eventTitle: z.string().nonempty().nullable(),
  postStatus: GapStatusSchema.nullable(),
  // Clef が質問ごとに返した保存済みの回答。未判定・壊れている場合は null。
  answers: ClefResponseSchema.shape.answers.nullable(),
  // 投稿状態として選ばれた選択肢の確率。postStatus が無い時は必ず null。
  postStatusProbability: z.number().min(0).max(1).nullable(),
  // 保留ジョブだけに付く、しきい値を適用しないAIの下書き（未登録）。
  draft: DetectionDraftSchema.nullable(),
  // 未保存の旧判定を現行ルールで再生成せず、旧履歴とは区別する。
  discovery: WebhookDiscoverySchema.nullable().optional(),
  relatedEvents: WebhookRelatedEventsSchema.nullable().optional(),
  attempts: z.number().int().nonnegative(),
  notificationStatus: WebhookNotificationStatusSchema,
  notificationId: z.string().nonempty().nullable(),
  notificationError: z.string().nonempty().nullable(),
  notificationAttempts: z.number().int().nonnegative(),
  lastError: z.string().nonempty().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  judgedAt: z.iso.datetime().nullable()
})
export const WebhookCandidateSchema = WebhookJobFieldsSchema.extend({
  item: z.string().nonempty(),
  storeKey: z.string().nonempty().nullable().default(null)
})
export type WebhookCandidate = z.infer<typeof WebhookCandidateSchema>
export const WebhookJobSchema = WebhookJobFieldsSchema.extend({
  candidates: z.array(WebhookCandidateSchema).default([]),
  itemCountAudit: ItemCountAuditSchema.nullable().optional()
})
export type WebhookJob = z.infer<typeof WebhookJobSchema>
export const WebhookJobListSchema = z.object({
  jobs: z.array(WebhookJobSchema),
  nextCursor: z.string().nonempty().nullable()
})
// 一覧の絞り込み・並べ替え。サーバー（クエリ）・クライアント・画面の保存値が同じスキーマを共有する。
/** 受信日時（j.created_at）の窓。未指定は全期間。 */
export const WebhookJobRangeSchema = z.enum(['1h', '24h'])
export type WebhookJobRange = z.infer<typeof WebhookJobRangeSchema>
/** 並べ替えの軸。confidence の NULL（未判定）は最小値として扱う。 */
export const WebhookJobSortSchema = z.enum(['createdAt', 'confidence'])
export type WebhookJobSort = z.infer<typeof WebhookJobSortSchema>
export const WebhookJobOrderSchema = z.enum(['asc', 'desc'])
export type WebhookJobOrder = z.infer<typeof WebhookJobOrderSchema>
/** 既定の並びは受信日時の新しい順。 */
export const DEFAULT_WEBHOOK_JOB_SORT = 'createdAt' satisfies WebhookJobSort
export const DEFAULT_WEBHOOK_JOB_ORDER = 'desc' satisfies WebhookJobOrder
/** 現在のキーワードルールによる判定。DB に保存しない値なので、サーバーは走査して絞り込む。 */
export const WebhookKeywordVerdictSchema = z.enum(WEBHOOK_KEYWORD_VERDICTS)
/**
 * 一覧のステータス列と同じ規則の絞り込み。ignored（却下）はジョブの状態で、画面では最優先。
 * それ以外は保存済みの回答（answers_json）で選ばれた投稿状態。
 */
export const WebhookPostStatusFilterSchema = z.enum([...GapStatusSchema.options, 'ignored'])
export type WebhookPostStatusFilter = z.infer<typeof WebhookPostStatusFilterSchema>
export const WebhookScreenNameSchema = z.string().regex(/^[A-Za-z0-9_]{1,15}$/)
export const WebhookDiscoveryFilterSchema = z.enum(['detected', 'uncertain', 'not_detected', 'unrecorded'])
export type WebhookDiscoveryFilter = z.infer<typeof WebhookDiscoveryFilterSchema>
export const WebhookJobQuerySchema = z.object({
  screenName: WebhookScreenNameSchema.optional(),
  discovery: WebhookDiscoveryFilterSchema.optional(),
  status: WebhookJobStatusSchema.optional(),
  cursor: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  range: WebhookJobRangeSchema.optional(),
  sort: WebhookJobSortSchema.default(DEFAULT_WEBHOOK_JOB_SORT),
  order: WebhookJobOrderSchema.default(DEFAULT_WEBHOOK_JOB_ORDER),
  verdict: WebhookKeywordVerdictSchema.optional(),
  postStatus: WebhookPostStatusFilterSchema.optional()
})
export type WebhookJobQuery = z.infer<typeof WebhookJobQuerySchema>
export const WebhookRetrySchema = z.strictObject({
  notificationOnly: z.boolean(),
  allowUnknown: z.boolean(),
  candidateId: z.uuid().optional()
})
export const WebhookResolveSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('register'), event: EventRequestSchema, candidateId: z.uuid().optional() }),
  z.strictObject({ action: z.literal('link'), eventId: z.uuid(), candidateId: z.uuid().optional() }),
  z.strictObject({ action: z.literal('reject'), candidateId: z.uuid().optional() })
])
export const WebhookConfigurationSchema = z.object({
  configured: z.boolean(),
  queueConfigured: z.boolean(),
  model: ClefModelSchema,
  eventThreshold: z.number(),
  ignoreThreshold: z.number(),
  /** 選択肢項目の共通値（環境変数）。項目別の既定値の元になる。 */
  choiceThreshold: z.number(),
  /** 項目別の有効なしきい値（保存値、無ければ既定値）。判定が実際に使う値。 */
  fieldThresholds: FieldThresholdsSchema
})
