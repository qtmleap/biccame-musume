import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertBenchmarkDirectory,
  PIPELINE_DATASETS,
  PipelineDatasetSchema,
  resolvePipelineCohort
} from '../scripts/lib/event-detect/goal-pipeline-dataset'
import {
  loadExpandedGoalCorpus,
  selectExpandedGoalCohort
} from '../scripts/lib/event-detect/goal-pipeline-expanded-corpus'
import {
  loadAnnotatedGoalCorpus,
  selectAnnotatedGoalCohort
} from '../scripts/lib/event-detect/goal-pipeline-goal-corpus'
import { fixtureProvenance, fixtureRows, writeExpandedFixture } from './fixtures/expanded-corpus'

const directories: string[] = []
afterAll(() => Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))))
const temporary = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pipeline-dataset-'))
  directories.push(directory)
  return directory
}

// 100件以上の組が必要な選定を通すため、50組(100件)の合成コーパスを使う。実データやD1・AIには触れない。
const rows = fixtureRows(50)
const expandedDirectory = await temporary()
await writeExpandedFixture(expandedDirectory, rows, fixtureProvenance(rows, 586))
const SEED = PIPELINE_DATASETS.expanded.seed
const expandedCohort = async (directory: string, size?: number) =>
  resolvePipelineCohort({ kind: 'expanded', corpusDirectory: expandedDirectory, directory, size, seed: SEED })
const freeze = async (directory: string, cohort: unknown) =>
  writeFile(join(directory, 'cohort.json'), JSON.stringify(cohort, null, 2))
const frozenExpanded = async () => selectExpandedGoalCohort(await loadExpandedGoalCorpus(expandedDirectory), 100, SEED)
const goalCorpus = await loadAnnotatedGoalCorpus()
const goalCohort = () => selectAnnotatedGoalCohort(goalCorpus.cases, 100, PIPELINE_DATASETS.goal.seed)

describe('dataset defaults', () => {
  test('goal keeps its original defaults and never shares a directory, approval or seed with another dataset', () => {
    expect(PIPELINE_DATASETS.goal).toEqual({
      revision: 'annotated-goal-v1',
      directory: '.wrangler/benchmarks/goal-pipeline/phase1',
      approval: '.wrangler/production-sync/goal-integration-safety-gate.json',
      seed: 'goal-pipeline-v1'
    })
    for (const key of ['directory', 'approval', 'seed'] as const) {
      const values = Object.values(PIPELINE_DATASETS).map((config) => config[key])
      expect(new Set([PIPELINE_DATASETS.goal[key], PIPELINE_DATASETS.expanded[key]]).size).toBe(2)
      expect(PIPELINE_DATASETS.expanded[key]).not.toBe(PIPELINE_DATASETS.goal[key])
      expect(values).toHaveLength(3)
    }
    expect(PIPELINE_DATASETS.expanded.revision).toBe('annotated-expanded-v2')
    expect(PipelineDatasetSchema.safeParse('annotated-expanded-v2').success).toBe(false)
  })

  test('the committed goal 100-case selection is byte-identical in content to the frozen phase1 hash', () => {
    const selected = goalCohort()
    expect(selected.inputHash).toBe('12bc2dc03fcc2d710e092145b17111a111a8b3948483c691e15e086543ac4be3')
    expect(selected.selection.dataset).toBe('annotated-goal-v1')
    expect([selected.positive, selected.negative]).toEqual([50, 50])
  })

  test('reports stay inside the ignored benchmark directory', () => {
    expect(() => assertBenchmarkDirectory('.wrangler/benchmarks/goal-pipeline/expanded-v2')).not.toThrow()
    expect(() => assertBenchmarkDirectory('/tmp/elsewhere')).toThrow('ignored benchmark directory')
    expect(() => assertBenchmarkDirectory('.wrangler/benchmarks/../escape')).toThrow('ignored benchmark directory')
  })
})

describe('expanded selection', () => {
  test('uses every matched pair by default, labels the revision and pins the corpus digests', async () => {
    const { selected, saved } = await expandedCohort(await temporary())
    expect(saved).toBeNull()
    const expected = await frozenExpanded()
    expect(selected.inputHash).toBe(expected.inputHash)
    expect(selected.size).toBe(100)
    expect([expected.positive, expected.negative]).toEqual([50, 50])
    expect(expected.selection.dataset).toBe('annotated-expanded-v2')
    expect(expected.selection.availableMatchedPairs).toBe(50)
    expect(expected.selection.corpus.priorCorpusCases).toBe(586)
    expect(expected.cases.every((sample) => sample.id.startsWith('expanded-v2-'))).toBe(true)
  })

  test('a frozen expanded cohort is reused only when the request and every case still match', async () => {
    const directory = await temporary()
    await freeze(directory, await frozenExpanded())
    const again = await expandedCohort(directory)
    expect(again.saved).not.toBeNull()
    expect(again.selected.inputHash).toBe((await frozenExpanded()).inputHash)
    await expect(expandedCohort(directory, 60)).rejects.toThrow('Requested size or seed differs')
  })
})

describe('cross-dataset reuse is rejected', () => {
  test('the frozen goal 100 cohort cannot be reused as an expanded result', async () => {
    const directory = await temporary()
    await freeze(directory, goalCohort())
    await expect(expandedCohort(directory)).rejects.toThrow('belongs to dataset annotated-goal-v1')
  })

  test('relabeling the goal cohort as expanded still fails because its cases are not in the expanded corpus', async () => {
    const directory = await temporary()
    const goal = goalCohort()
    await freeze(directory, { ...goal, selection: { ...goal.selection, dataset: 'annotated-expanded-v2' } })
    await expect(expandedCohort(directory)).rejects.toThrow('absent from or differs from the current corpus')
  })

  test('an expanded cohort is not accepted as the goal cohort either', async () => {
    const directory = await temporary()
    await freeze(directory, await frozenExpanded())
    await expect(
      resolvePipelineCohort({
        kind: 'goal',
        corpusDirectory: undefined,
        directory,
        size: 100,
        seed: 'goal-pipeline-v1'
      })
    ).rejects.toThrow('belongs to dataset annotated-expanded-v2')
  })

  test('an unchanged goal cohort is still accepted by the goal dataset', async () => {
    const directory = await temporary()
    await freeze(directory, goalCohort())
    const { saved, selected } = await resolvePipelineCohort({
      kind: 'goal',
      corpusDirectory: undefined,
      directory,
      size: 100,
      seed: 'goal-pipeline-v1'
    })
    expect(saved).not.toBeNull()
    expect(selected.inputHash).toBe('12bc2dc03fcc2d710e092145b17111a111a8b3948483c691e15e086543ac4be3')
  })
})

describe('tampered frozen expanded cohorts', () => {
  const rejects = async (mutate: (cohort: Awaited<ReturnType<typeof frozenExpanded>>) => unknown, message: string) => {
    const directory = await temporary()
    await freeze(directory, mutate(await frozenExpanded()))
    await expect(expandedCohort(directory)).rejects.toThrow(message)
  }

  test('a case whose label or text changed after freezing is rejected by its hash', () =>
    rejects(
      (cohort) => ({
        ...cohort,
        cases: cohort.cases.map((sample, index) => (index === 0 ? { ...sample, rationale: '改変' } : sample))
      }),
      'absent from or differs from the current corpus'
    ))

  test('pairs that do not account for every frozen case are rejected', () =>
    rejects(
      (cohort) => ({ ...cohort, selection: { ...cohort.selection, pairs: cohort.selection.pairs.slice(1) } }),
      'selection pairs do not account for every frozen case'
    ))

  test('a pair that swaps the positive and negative case is rejected', () =>
    rejects(
      (cohort) => ({
        ...cohort,
        selection: {
          ...cohort.selection,
          pairs: cohort.selection.pairs.map((pair) => ({ ...pair, positive: pair.negative, negative: pair.positive }))
        }
      }),
      'selection pair polarity differs from the frozen cases'
    ))

  test('digests pinned at freezing time must still match the current corpus', () =>
    rejects(
      (cohort) => ({
        ...cohort,
        selection: { ...cohort.selection, corpus: { ...cohort.selection.corpus, annotationsSha256: 'f'.repeat(64) } }
      }),
      'frozen corpus digests differ from the current expanded corpus'
    ))

  test('counts and the available pool recorded at freezing time must match', async () => {
    await rejects((cohort) => ({ ...cohort, positive: 49, negative: 51 }), 'frozen positive/negative counts differ')
    await rejects(
      (cohort) => ({ ...cohort, selection: { ...cohort.selection, availableCases: 236 } }),
      'selection was made from 236 cases'
    )
    await rejects(
      (cohort) => ({ ...cohort, selection: { dataset: 'annotated-expanded-v2' } }),
      'selection provenance is incomplete'
    )
  })

  test('a cohort with a recomputed input hash is still checked against the corpus, not just against itself', () =>
    rejects((cohort) => ({ ...cohort, cases: [...cohort.cases].reverse() }), 'Frozen pipeline input hash mismatch'))
})
