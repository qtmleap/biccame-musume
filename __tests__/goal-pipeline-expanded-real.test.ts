import { expect, test } from 'bun:test'
import { benchmarkTextHash } from '../scripts/lib/event-detect/benchmark-corpus'
import {
  expandedCorpusIssues,
  expandedDefaultSize,
  loadExpandedGoalCorpus,
  loadPriorCorpus,
  selectExpandedGoalCohort
} from '../scripts/lib/event-detect/goal-pipeline-expanded-corpus'
import {
  loadAnnotatedGoalCorpus,
  selectAnnotatedGoalCohort
} from '../scripts/lib/event-detect/goal-pipeline-goal-corpus'

// 同梱された小さなJSONだけを読む。巨大な原archiveやローカルD1には触れない。
const corpus = await loadExpandedGoalCorpus()
const prior = await loadPriorCorpus()

test('the committed expanded corpus passes every machine check', async () => {
  expect(await expandedCorpusIssues()).toEqual([])
})

test('it has 200 balanced new cases and no overlap with the 586 existing cases', () => {
  expect(prior).toHaveLength(586)
  expect(corpus.cases).toHaveLength(200)
  expect(corpus.cases.filter((sample) => sample.expected.isEvent)).toHaveLength(100)
  expect(corpus.cases.filter((sample) => !sample.expected.isEvent)).toHaveLength(100)
  expect(corpus.provenance.priorCorpusCases).toBe(prior.length)
  const fields: [string, (value: (typeof prior)[number]) => string][] = [
    ['case id', (row) => row.id],
    ['post id', (row) => row.postId],
    ['normalized text', (row) => benchmarkTextHash(row.text)],
    ['campaign group', (row) => row.group]
  ]
  const fresh: Record<string, string[]> = {
    'case id': corpus.cases.map((sample) => sample.id),
    'post id': corpus.cases.map((sample) => sample.post.id),
    'normalized text': corpus.cases.map((sample) => benchmarkTextHash(sample.post.text)),
    'campaign group': corpus.cases.map((sample) => sample.group)
  }
  for (const [name, pick] of fields) {
    const existing = new Set(prior.map(pick))
    expect(fresh[name]?.filter((value) => existing.has(value))).toEqual([])
    expect(new Set(fresh[name]).size).toBe(200)
  }
})

test('every positive evidence is verbatim in its post and the month/account classes match', () => {
  const bucket = (sample: (typeof corpus.cases)[number]) =>
    `${sample.post.createdAt.slice(0, 7)}:${sample.post.screenName.toLowerCase()}`
  for (const sample of corpus.cases)
    for (const item of sample.stageGold.items)
      for (const evidence of item.evidence) expect(sample.post.text).toContain(evidence)
  const count = (positive: boolean) =>
    corpus.cases
      .filter((sample) => sample.expected.isEvent === positive)
      .map(bucket)
      .toSorted()
  expect(count(true)).toEqual(count(false))
  expect(
    corpus.cases.every((sample) =>
      sample.id.startsWith(`expanded-v2-${sample.expected.isEvent ? 'positive' : 'negative'}-`)
    )
  ).toBe(true)
})

test('unannotated gold fields stay unknown instead of being filled in or called wrong', () => {
  for (const sample of corpus.cases)
    for (const field of sample.stageGold.unannotatedFields) expect(Reflect.get(sample.expected, field)).toBeNull()
  expect(
    corpus.cases.every((sample) => sample.observedD1.annotationUse === 'diagnostic-only-not-gold-not-model-input')
  ).toBe(true)
})

test('the expanded default selection uses every pair and leaves the frozen goal 100 selection untouched', async () => {
  expect(expandedDefaultSize(corpus)).toBe(200)
  const selected = selectExpandedGoalCohort(corpus, 200, 'expanded-v2-pipeline-v1')
  expect([selected.positive, selected.negative]).toEqual([100, 100])
  expect(selected.selection.dataset).toBe('annotated-expanded-v2')
  const goal = selectAnnotatedGoalCohort((await loadAnnotatedGoalCorpus()).cases, 100, 'goal-pipeline-v1')
  expect(goal.inputHash).toBe('12bc2dc03fcc2d710e092145b17111a111a8b3948483c691e15e086543ac4be3')
  const goalIds = new Set(goal.cases.map((sample) => sample.id))
  expect(selected.cases.filter((sample) => goalIds.has(sample.id))).toEqual([])
})
