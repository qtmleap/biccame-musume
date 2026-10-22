import { z } from 'zod'
import { EventCharacterSchema } from '../schemas/event.dto'

export const CategorySchema = z.enum(['limited_card', 'regular_card', 'ackey', 'acsta', 'other'])
export type Category = z.infer<typeof CategorySchema>
export const PurchaseAmountSchema = z.number().int().nonnegative()
export const QuantitySchema = z.number().int().positive()
export const ConditionSchema = z.object({
  type: z.enum(['purchase', 'charge', 'first_come', 'lottery', 'everyone']),
  purchaseAmount: PurchaseAmountSchema.optional(),
  chargeAmount: PurchaseAmountSchema.optional(),
  quantity: QuantitySchema.optional()
})
export type Condition = z.infer<typeof ConditionSchema>
export const DetectionCandidateSchema = z.object({
  category: CategorySchema,
  title: z.string().nonempty().max(200),
  stores: z.array(z.string().nonempty()).nonempty(),
  characterIds: z.array(EventCharacterSchema).default([]),
  startDate: z.iso.date(),
  endDate: z.iso.date().optional(),
  conditions: z.array(ConditionSchema).nonempty(),
  referenceUrls: z.array(z.object({ type: z.enum(['announce', 'start']), url: z.url() })).nonempty(),
  limitedQuantity: z.number().int().positive().optional(),
  isPreliminary: z.literal(false)
})
export type DetectionCandidate = z.infer<typeof DetectionCandidateSchema>
/** しきい値を適用せず回答の最有力候補だけで作る保留ジョブの下書き。登録候補ではない。 */
export const DetectionDraftSchema = z.object({
  title: z.string().nonempty().max(200).optional(),
  category: CategorySchema.optional(),
  stores: z.array(z.string().nonempty()),
  characterIds: z.array(EventCharacterSchema).default([]),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  conditions: z.array(ConditionSchema),
  limitedQuantity: QuantitySchema.optional()
})
export type DetectionDraft = z.infer<typeof DetectionDraftSchema>
const CommonResult = { confidence: z.number().min(0).max(1), reasons: z.array(z.string().nonempty()) }
export const DetectionResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ignored'), ...CommonResult }),
  z.object({ status: z.literal('held'), ...CommonResult, candidate: DetectionCandidateSchema.optional() }),
  z.object({ status: z.literal('register'), ...CommonResult, candidate: DetectionCandidateSchema })
])
export type DetectionResult = z.infer<typeof DetectionResultSchema>
