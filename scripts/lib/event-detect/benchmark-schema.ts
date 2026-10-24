import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { EventCategorySchema, EventConditionTypeSchema } from '@biccame/shared/schemas/event.dto'
import { z } from 'zod'

// nullは未注釈、空配列は原文で確認できた「なし」。評価の分母を混同しない。
export const BenchmarkExpectedSchema = z.object({
  isEvent: z.boolean(),
  status: z.union([z.enum(['register', 'held', 'ignored']), z.null()]).default(null),
  category: z.union([EventCategorySchema, z.null()]).default(null),
  stores: z.union([z.array(z.string().nonempty()), z.null()]).default(null),
  characterIds: z.union([z.array(z.string().nonempty()), z.null()]).default(null),
  startDate: z.union([z.iso.date(), z.null()]).default(null),
  conditions: z
    .union([
      z.array(
        z.object({
          type: EventConditionTypeSchema,
          amount: z.number().int().nonnegative().optional(),
          quantity: z.number().int().positive().optional()
        })
      ),
      z.null()
    ])
    .default(null)
})
export const BenchmarkCaseSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  source: z.enum(['public-post', 'synthetic']),
  description: z.string().nonempty(),
  post: DetectPostSchema,
  expected: BenchmarkExpectedSchema,
  rationale: z.string().nonempty(),
  tags: z.array(z.string().nonempty()),
  group: z.string().nonempty(),
  reviewStatus: z.literal('provisional'),
  sourceHash: z.string().nonempty().optional(),
  sourceTextHash: z.string().nonempty().optional()
})
export type BenchmarkExpected = z.infer<typeof BenchmarkExpectedSchema>
export type BenchmarkCase = z.infer<typeof BenchmarkCaseSchema>
