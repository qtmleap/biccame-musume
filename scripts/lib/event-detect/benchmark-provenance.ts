import { z } from 'zod'

// 未保存の選定情報を、現在のコーパス件数で代用しない。
export const BenchmarkProvenanceSchema = z.object({
  source: z.enum(['selection', 'audit-revision']),
  revision: z.string().nonempty(),
  corpusUnique: z.number().int().nonnegative(),
  availableIndependentHoldout: z.number().int().nonnegative().nullable(),
  excluded: z.union([z.array(z.object({ id: z.string().nonempty(), reason: z.string().nonempty() })), z.null()]),
  originalManifestHash: z.string().nonempty().optional(),
  reusedCases: z.number().int().nonnegative(),
  newlyEvaluatedCases: z.number().int().nonnegative()
})
export type BenchmarkProvenance = z.infer<typeof BenchmarkProvenanceSchema>
