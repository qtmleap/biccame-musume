import { z } from 'zod'
import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'

export const GoalExtractionEventSchema = z.object({
  item: z.string().nonempty(),
  stores: z.array(z.string().nonempty()),
  characterIds: z.array(z.string().nonempty()),
  evidence: z.array(z.string().nonempty()).nonempty()
})
export const GoalExtractionSchema = z.object({ events: z.array(GoalExtractionEventSchema) })
export const GoalAuditSchema = z.object({
  version: z.string().nonempty(),
  expected: z.union([z.number().int().nonnegative(), z.null()]),
  probability: z.union([z.number().min(0).max(1), z.null()]),
  threshold: z.number().positive().max(1),
  extracted: z.number().int().nonnegative(),
  candidates: z.number().int().nonnegative(),
  status: z.enum(['matched', 'mismatch', 'unknown', 'low_confidence', 'overflow'])
})
export const GoalDecisionSchema = z
  .object({
    status: z.enum(['register', 'held', 'ignored']),
    confidence: z.number().min(0).max(1),
    reasons: z.array(z.string().nonempty())
  })
  .passthrough()
export const GoalOutcomeSchema = z.object({
  discovery: z.object({
    status: z.enum(['detected', 'uncertain', 'not_event']),
    confidence: z.union([z.number().min(0).max(1), z.null()]),
    evidence: z.array(z.string().nonempty())
  }),
  action: z.enum(['create', 'review', 'update', 'end', 'ignore']),
  missingFields: z.array(z.string().nonempty())
})
export const GoalJudgementSchema = z.object({
  item: z.string().nonempty(),
  post: DetectPostSchema,
  requests: z.array(ClefRequestSchema),
  response: ClefResponseSchema,
  decision: GoalDecisionSchema,
  draft: z.record(z.string().nonempty(), z.unknown()),
  outcome: z.union([GoalOutcomeSchema, z.null()]),
  groundedEvidence: z.array(z.string().nonempty()),
  contextOnly: z.boolean()
})
export const GoalPipelineResultSchema = z.object({
  version: z.string().nonempty(),
  extractionVersion: z.string().nonempty(),
  inputHash: z.string().nonempty(),
  post: DetectPostSchema,
  extraction: GoalExtractionSchema,
  audit: GoalAuditSchema,
  countRequest: ClefRequestSchema,
  countResponse: ClefResponseSchema,
  judgements: z.array(GoalJudgementSchema),
  stopped: z.boolean(),
  stopReasons: z.array(z.string().nonempty()),
  calls: z.number().int().nonnegative()
})
export type GoalExtraction = z.infer<typeof GoalExtractionSchema>
export type GoalPipelineResult = z.infer<typeof GoalPipelineResultSchema>
export type GoalJudgement = z.infer<typeof GoalJudgementSchema>
