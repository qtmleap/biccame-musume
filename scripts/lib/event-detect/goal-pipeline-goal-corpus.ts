import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { BenchmarkCaseSchema } from './benchmark-schema'
import { benchmarkTextHash } from './benchmark-corpus'
import { goalHash } from './goal-pipeline-module'
import { goalModelPost } from './goal-pipeline-input'

export const GoalAnnotatedCaseSchema = BenchmarkCaseSchema.extend({
  stageGold: z.object({
    action: z.enum(['new', 'update', 'end', 'preliminary', 'needs_context', 'not_event']),
    registration: z.enum(['ready', 'needs_info', 'not_new', 'needs_context', 'not_applicable']),
    items: z.array(z.object({ item: z.string().nonempty(), evidence: z.array(z.string().nonempty()).nonempty() })),
    groupingNote: z.string().nonempty(),
    unannotatedFields: z.array(z.string().nonempty())
  }),
  provenance: z.object({
    archive: z.string().nonempty(),
    line: z.number().int().positive(),
    postSha256: z.string().nonempty(),
    textSha256: z.string().nonempty()
  }),
  observedD1: z.object({
    annotationUse: z.literal('diagnostic-only-not-gold-not-model-input'),
    job: z.unknown(),
    candidates: z.array(z.unknown()),
    referencedEvents: z.array(z.unknown())
  })
})
export type GoalAnnotatedCase = z.infer<typeof GoalAnnotatedCaseSchema>
const RawRowsSchema = z.array(z.record(z.string(), z.unknown()))
export const GOAL_DATASET_REVISION = 'annotated-goal-v1'
export const loadAnnotatedGoalCorpus = async (directory = 'scripts/data/event-detection-benchmark') => {
  const files = (await readdir(directory)).filter((file) => /^goal-\d{3}\.json$/.test(file)).sort()
  if (files.length === 0) throw new Error('Annotated goal corpus is missing')
  const cases: GoalAnnotatedCase[] = []
  // スキーマが捨てる前の原行。注釈digestや未知キーの検査に使い、既存の利用側は参照しない。
  const rows: z.infer<typeof RawRowsSchema> = []
  for (const file of files) {
    const raw: unknown = JSON.parse(await readFile(join(directory, file), 'utf8'))
    const parsed = z.array(GoalAnnotatedCaseSchema).safeParse(raw)
    const rawRows = RawRowsSchema.safeParse(raw)
    if (!parsed.success || !rawRows.success) throw new Error(`Invalid annotated goal corpus: ${file}`)
    cases.push(...parsed.data)
    rows.push(...rawRows.data)
  }
  for (const values of [
    cases.map((sample) => sample.post.id),
    cases.map((sample) => benchmarkTextHash(sample.post.text)),
    cases.map((sample) => sample.group)
  ])
    if (new Set(values).size !== values.length) throw new Error('Goal corpus contains duplicate post, text or campaign')
  cases.forEach((sample) => goalModelPost(sample))
  return { cases, files, rawCount: cases.length, rows }
}

const monthAccount = (sample: GoalAnnotatedCase) =>
  `${sample.post.createdAt.slice(0, 7)}:${sample.post.screenName.toLowerCase()}`
export const selectAnnotatedGoalCohort = (
  cases: GoalAnnotatedCase[],
  size = 100,
  seed = 'goal-stage-matched-v1',
  dataset = GOAL_DATASET_REVISION
) => {
  if (!Number.isInteger(size) || size < 100 || size % 2 !== 0)
    throw new Error('Goal cohort must be even and at least 100')
  const buckets = [...new Set(cases.map(monthAccount))].sort()
  const pairs = buckets
    .flatMap((bucket) => {
      const order = (values: GoalAnnotatedCase[]) =>
        values.toSorted((a, b) => goalHash(`${seed}:${a.id}`).localeCompare(goalHash(`${seed}:${b.id}`)))
      const positive = order(cases.filter((sample) => monthAccount(sample) === bucket && sample.expected.isEvent))
      const negative = order(cases.filter((sample) => monthAccount(sample) === bucket && !sample.expected.isEvent))
      if (positive.length !== negative.length) throw new Error(`Unmatched goal corpus month/account bucket: ${bucket}`)
      return positive.map((sample, index) => {
        const control = negative[index]
        if (control === undefined) throw new Error('Missing negative pair')
        return { bucket, positive: sample, negative: control }
      })
    })
    .toSorted((a, b) =>
      goalHash(`${seed}:${a.positive.id}:${a.negative.id}`).localeCompare(
        goalHash(`${seed}:${b.positive.id}:${b.negative.id}`)
      )
    )
  const chosen = pairs.slice(0, size / 2)
  if (chosen.length * 2 !== size) throw new Error('Insufficient independent matched goal pairs')
  const selected = chosen.flatMap((pair) => [pair.positive, pair.negative])
  return {
    cases: selected,
    diagnostic: [],
    seed,
    size,
    positive: chosen.length,
    negative: chosen.length,
    inputHash: goalHash(selected),
    selection: {
      dataset,
      availableCases: cases.length,
      availableMatchedPairs: pairs.length,
      pairs: chosen.map((pair) => ({ bucket: pair.bucket, positive: pair.positive.id, negative: pair.negative.id }))
    }
  }
}
