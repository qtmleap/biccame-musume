import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { BenchmarkCaseSchema } from './benchmark-schema'
import { promptCycleHash } from './prompt-cycle-evaluator'

const manifestSchema = z.object({
  evaluator: z.object({ version: z.string().nonempty(), sha256: z.string().nonempty(), thresholds: z.unknown() }),
  cases: z.array(BenchmarkCaseSchema)
})
const summarySchema = z.object({
  total: z.number().int(),
  completed: z.number().int(),
  errors: z.number().int(),
  missing: z.number().int(),
  event: z.object({
    tp: z.number().int(),
    fp: z.number().int(),
    fn: z.number().int(),
    tn: z.number().int(),
    positive: z.number().int(),
    negative: z.number().int(),
    abstained: z.number().int(),
    recall: z.union([z.number(), z.null()]),
    precision: z.union([z.number(), z.null()]),
    balancedAccuracy: z.union([z.number(), z.null()])
  }),
  pipeline: z.unknown(),
  fields: z.unknown()
})
const read = async (directory: string, file: string): Promise<unknown> =>
  JSON.parse(await readFile(join(directory, file), 'utf8'))

// 同じ入力・正解・閾値のpaired比較だけを採用gateへ渡す。
export const comparePromptCycleArms = async (before: string, after: string, out: string) => {
  const bManifest = manifestSchema.safeParse(await read(before, 'manifest.json'))
  const aManifest = manifestSchema.safeParse(await read(after, 'manifest.json'))
  const b = summarySchema.safeParse(await read(before, 'summary.json'))
  const a = summarySchema.safeParse(await read(after, 'summary.json'))
  if (!bManifest.success || !aManifest.success || !b.success || !a.success)
    throw new Error('Invalid paired cycle reports')
  if (
    promptCycleHash(bManifest.data.cases) !== promptCycleHash(aManifest.data.cases) ||
    promptCycleHash(bManifest.data.evaluator.thresholds) !== promptCycleHash(aManifest.data.evaluator.thresholds)
  )
    throw new Error('Paired cycle input, labels or thresholds changed')
  const complete =
    a.data.completed === a.data.total &&
    b.data.completed === b.data.total &&
    a.data.errors === 0 &&
    b.data.errors === 0 &&
    a.data.missing === 0 &&
    b.data.missing === 0
  const recallImproved =
    a.data.event.recall !== null && b.data.event.recall !== null && a.data.event.recall > b.data.event.recall
  const fpNotIncreased = a.data.event.fp <= b.data.event.fp
  const report = {
    before: { evaluator: bManifest.data.evaluator, ...b.data },
    after: { evaluator: aManifest.data.evaluator, ...a.data },
    gate: { complete, recallImproved, fpNotIncreased, passed: complete && recallImproved && fpNotIncreased },
    limitations: [
      'Provisional labels are not human-reviewed ground truth.',
      'Development-set gains require independent final holdout confirmation.',
      'Held cases and errors remain in the full denominator; pipeline and raw event are distinct.'
    ]
  }
  await writeFile(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return report
}
