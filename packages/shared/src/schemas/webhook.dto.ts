import { ClefModelSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { DetectionDraftSchema, FieldThresholdsSchema } from '@biccame/shared/event-detect/detection'
import { ItemCountAuditSchema } from '@biccame/shared/event-detect/extraction'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { GapStatusSchema } from '@biccame/shared/event-detect/viewer'
import { EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import { z } from 'zod'

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
export const WebhookJobQuerySchema = z.object({
  status: WebhookJobStatusSchema.optional(),
  cursor: z
    .string()
    .regex(/^\d{1,20}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
})
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
