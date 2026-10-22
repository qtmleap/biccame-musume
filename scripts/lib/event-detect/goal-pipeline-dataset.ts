import { resolve, sep } from 'node:path'
import { z } from 'zod'
import { BenchmarkCaseSchema } from './benchmark-schema'
import { loadGoalCorpus, selectGoalCohort } from './goal-pipeline-corpus'
import { EXPANDED_DATASET_REVISION } from './goal-pipeline-expanded-audit'
import {
  type ExpandedCorpus,
  expandedDefaultSize,
  loadExpandedGoalCorpus,
  selectExpandedGoalCohort
} from './goal-pipeline-expanded-corpus'
import {
  GOAL_DATASET_REVISION,
  GoalAnnotatedCaseSchema,
  loadAnnotatedGoalCorpus,
  selectAnnotatedGoalCohort
} from './goal-pipeline-goal-corpus'
import { goalHash } from './goal-pipeline-module'

export const PipelineDatasetSchema = z.enum(['goal', 'expanded', 'legacy'])
export type PipelineDataset = z.infer<typeof PipelineDatasetSchema>

type DatasetConfig = { revision: string | undefined; directory: string; approval: string; seed: string }
const BENCHMARK_ROOT = '.wrangler/benchmarks/goal-pipeline'
const PRODUCTION_SYNC = '.wrangler/production-sync'
// datasetごとに保存先・承認ファイル・seedを分け、別datasetで凍結したcohortや承認を既定のまま拾わないようにする。
export const PIPELINE_DATASETS: Record<PipelineDataset, DatasetConfig> = {
  goal: {
    revision: GOAL_DATASET_REVISION,
    directory: `${BENCHMARK_ROOT}/phase1`,
    approval: `${PRODUCTION_SYNC}/goal-integration-safety-gate.json`,
    seed: 'goal-pipeline-v1'
  },
  expanded: {
    revision: EXPANDED_DATASET_REVISION,
    directory: `${BENCHMARK_ROOT}/expanded-v2`,
    approval: `${PRODUCTION_SYNC}/expanded-v2-safety-gate.json`,
    seed: 'expanded-v2-pipeline-v1'
  },
  legacy: {
    revision: undefined,
    directory: `${BENCHMARK_ROOT}/legacy`,
    approval: `${PRODUCTION_SYNC}/goal-integration-safety-gate.json`,
    seed: 'goal-pipeline-v1'
  }
}

export type PipelineCorpus =
  | ({ kind: 'goal' } & Awaited<ReturnType<typeof loadAnnotatedGoalCorpus>>)
  | ({ kind: 'expanded' } & ExpandedCorpus)
  | ({ kind: 'legacy' } & Awaited<ReturnType<typeof loadGoalCorpus>>)

// goalは既存の236件、expandedは追加の別コーパス、legacyは旧A〜F。どれも互いに統合しない。
export const loadPipelineCorpus = async (
  kind: PipelineDataset,
  directory: string | undefined
): Promise<PipelineCorpus> => {
  if (kind === 'goal') return { kind, ...(await loadAnnotatedGoalCorpus(directory)) }
  if (kind === 'expanded') return { kind, ...(await loadExpandedGoalCorpus(directory)) }
  return { kind, ...(await loadGoalCorpus(directory)) }
}

// expandedだけは件数を指定しない場合に、揃う組を全て使う。goal/legacyの既定は従来どおり100件。
export const defaultCohortSize = (corpus: PipelineCorpus) =>
  corpus.kind === 'expanded' ? expandedDefaultSize(corpus) : 100

export const selectPipelineCohort = (corpus: PipelineCorpus, size: number, seed: string) => {
  if (corpus.kind === 'goal') return selectAnnotatedGoalCohort(corpus.cases, size, seed)
  if (corpus.kind === 'expanded') return selectExpandedGoalCohort(corpus, size, seed)
  return selectGoalCohort(corpus.cases, size, seed)
}

export const savedCohortSchema = (kind: PipelineDataset) =>
  z
    .object({
      cases: z.array(kind === 'legacy' ? BenchmarkCaseSchema : GoalAnnotatedCaseSchema),
      diagnostic: z.array(BenchmarkCaseSchema),
      seed: z.string().nonempty(),
      size: z.number().int(),
      positive: z.number().int(),
      negative: z.number().int(),
      inputHash: z.string().nonempty(),
      selection: z.object({ dataset: z.string().nonempty() }).passthrough().optional()
    })
    .passthrough()
export type SavedCohort = z.infer<ReturnType<typeof savedCohortSchema>>

const PairedSelectionSchema = z.object({
  dataset: z.string().nonempty(),
  availableCases: z.number().int().positive(),
  availableMatchedPairs: z.number().int().positive(),
  pairs: z.array(
    z.object({ bucket: z.string().nonempty(), positive: z.string().nonempty(), negative: z.string().nonempty() })
  )
})
const ExpandedSelectionSchema = PairedSelectionSchema.extend({
  corpus: z.object({
    annotationsSha256: z.string().nonempty(),
    sourceRecordsSha256: z.string().nonempty(),
    priorCorpusCases: z.number().int().positive()
  })
})

type Identified = { id: string; expected: { isEvent: boolean } }
const hashesById = (cases: readonly Identified[]) => new Map(cases.map((sample) => [sample.id, goalHash(sample)]))

// 凍結時に固定した旧コーパスのdigestが、現行のexpandedコーパスと同じであることを確かめる。
const corpusPinIssues = (corpus: PipelineCorpus, selection: unknown) => {
  if (corpus.kind !== 'expanded') return []
  const pins = ExpandedSelectionSchema.safeParse(selection)
  if (!pins.success) return ['selection does not pin the expanded corpus digests']
  const { annotationsSha256, sourceRecordsSha256, priorCorpusCases } = pins.data.corpus
  return annotationsSha256 === corpus.provenance.annotationsSha256 &&
    sourceRecordsSha256 === corpus.provenance.sourceRecordsSha256 &&
    priorCorpusCases === corpus.provenance.priorCorpusCases
    ? []
    : ['frozen corpus digests differ from the current expanded corpus']
}

const pairedSelectionIssues = (corpus: PipelineCorpus, saved: SavedCohort) => {
  const parsed = PairedSelectionSchema.safeParse(saved.selection)
  if (!parsed.success) return ['selection provenance is incomplete']
  const { availableCases, availableMatchedPairs, pairs } = parsed.data
  const pairIds = pairs.flatMap((pair) => [pair.positive, pair.negative])
  const polarity = new Map(saved.cases.map((sample) => [sample.id, sample.expected.isEvent]))
  return [
    ...(availableCases === corpus.cases.length ? [] : [`selection was made from ${availableCases} cases`]),
    ...(availableMatchedPairs * 2 === availableCases ? [] : ['selection matched pair count is inconsistent']),
    ...(pairIds.length === saved.cases.length && new Set(pairIds).size === pairIds.length
      ? []
      : ['selection pairs do not account for every frozen case']),
    ...(pairs.every((pair) => polarity.get(pair.positive) === true && polarity.get(pair.negative) === false)
      ? []
      : ['selection pair polarity differs from the frozen cases']),
    ...corpusPinIssues(corpus, saved.selection)
  ]
}

// 凍結済みcohortが指定datasetの現行コーパスから作られたことを、dataset名・全ケースのid+hash・件数・選定の対応で確かめる。
// 別datasetの凍結物は1件でも食い違えば拒否し、旧goal100をexpandedの結果として再利用する経路を塞ぐ。
export const frozenCohortIssues = (corpus: PipelineCorpus, saved: SavedCohort) => {
  const revision = PIPELINE_DATASETS[corpus.kind].revision
  if (saved.selection?.dataset !== revision)
    return [`frozen cohort belongs to dataset ${String(saved.selection?.dataset)}, not ${String(revision)}`]
  const current = hashesById(corpus.cases)
  const foreign = saved.cases.filter((sample) => current.get(sample.id) !== goalHash(sample))
  const positive = saved.cases.filter((sample) => sample.expected.isEvent).length
  return [
    ...foreign.map((sample) => `frozen case ${sample.id} is absent from or differs from the current corpus`),
    ...(saved.size === saved.cases.length ? [] : ['frozen size differs from the frozen case count']),
    ...(saved.positive === positive && saved.negative === saved.cases.length - positive
      ? []
      : ['frozen positive/negative counts differ from the frozen cases']),
    ...(corpus.kind === 'legacy' || saved.diagnostic.length === 0 ? [] : ['paired cohort must not carry diagnostics']),
    ...(corpus.kind === 'legacy' ? [] : pairedSelectionIssues(corpus, saved))
  ]
}

const BENCHMARK_DIRECTORY = resolve('.wrangler/benchmarks')
// 報告と凍結cohortは、gitignoreされたbenchmarkディレクトリの外へ出さない。
export const assertBenchmarkDirectory = (directory: string) => {
  if (!resolve(directory).startsWith(BENCHMARK_DIRECTORY + sep))
    throw new Error('Reports must remain in the ignored benchmark directory')
}

type ResolveInput = {
  kind: PipelineDataset
  corpusDirectory: string | undefined
  directory: string
  size: number | undefined
  seed: string
}
// コーパスの読込・凍結cohortの照合・新規選定をまとめる。凍結済みは現行コーパスと全件一致しない限り使わない。
export const resolvePipelineCohort = async ({ kind, corpusDirectory, directory, size, seed }: ResolveInput) => {
  const corpus = await loadPipelineCorpus(kind, corpusDirectory)
  const requestedSize = size === undefined ? defaultCohortSize(corpus) : size
  const selectionPath = resolve(directory, 'cohort.json')
  const file = Bun.file(selectionPath)
  const parsed = (await file.exists()) ? savedCohortSchema(kind).safeParse(await file.json()) : null
  if (parsed !== null && !parsed.success) throw new Error('Invalid frozen pipeline cohort')
  const saved = parsed === null ? null : parsed.data
  const issues = saved === null ? [] : frozenCohortIssues(corpus, saved)
  if (issues.length > 0)
    throw new Error(
      `Frozen cohort is not usable for ${kind}: ${issues.length} issues, first: ${issues.slice(0, 5).join(' | ')}`
    )
  const selected = saved === null ? selectPipelineCohort(corpus, requestedSize, seed) : saved
  if (goalHash(selected.cases) !== selected.inputHash) throw new Error('Frozen pipeline input hash mismatch')
  if (selected.size !== requestedSize || selected.seed !== seed)
    throw new Error('Requested size or seed differs from frozen cohort')
  return { corpus, selected, saved, selectionPath }
}
