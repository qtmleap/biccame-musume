import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { benchmarkTextHash } from '../scripts/lib/event-detect/benchmark-corpus'
import { D1AnchoringSchema } from '../scripts/lib/event-detect/goal-pipeline-expanded-audit'
import {
  D1_ANCHORED_CORPUS_DIRECTORY,
  d1AnchoredCorpusIssues,
  loadPriorWithExpanded
} from '../scripts/lib/event-detect/goal-pipeline-expanded-corpus'
import {
  loadAnnotatedGoalCorpus,
  selectAnnotatedGoalCohort
} from '../scripts/lib/event-detect/goal-pipeline-goal-corpus'
import { goalModelPost } from '../scripts/lib/event-detect/goal-pipeline-input'

// 同梱された小さなJSONだけを読む。巨大な原archiveやローカルD1には触れない。
const corpus = await loadAnnotatedGoalCorpus(D1_ANCHORED_CORPUS_DIRECTORY)
const prior = await loadPriorWithExpanded()
const positives = corpus.cases.filter((sample) => sample.expected.isEvent)
const negatives = corpus.cases.filter((sample) => !sample.expected.isEvent)
const references = (sample: (typeof corpus.cases)[number]) =>
  sample.observedD1.referencedEvents.map((value) => Object(value))

test('the committed D1 anchored corpus passes every machine check', async () => {
  expect(await d1AnchoredCorpusIssues()).toEqual([])
})

test('it has 100 positive and 100 negative cases with no overlap with the 786 earlier cases', () => {
  expect([positives.length, negatives.length]).toEqual([100, 100])
  expect(prior).toHaveLength(786)
  const picks: [string, (row: (typeof prior)[number]) => string, string[]][] = [
    ['case id', (row) => row.id, corpus.cases.map((sample) => sample.id)],
    ['post id', (row) => row.postId, corpus.cases.map((sample) => sample.post.id)],
    [
      'normalized text',
      (row) => benchmarkTextHash(row.text),
      corpus.cases.map((sample) => benchmarkTextHash(sample.post.text))
    ],
    ['campaign group', (row) => row.group, corpus.cases.map((sample) => sample.group)]
  ]
  for (const [name, pick, fresh] of picks) {
    const existing = new Set(prior.map(pick))
    expect({ name, overlap: fresh.filter((value) => existing.has(value)) }).toEqual({ name, overlap: [] })
    expect(new Set(fresh).size).toBe(200)
  }
})

test('every positive cites a D1 registered event through its own post url and every negative cites none', () => {
  for (const sample of positives) {
    const refs = references(sample)
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(String(ref.referenceUrl)).toContain(`/status/${sample.post.id}`)
  }
  for (const sample of negatives) expect(sample.observedD1.referencedEvents).toEqual([])
  const origins = new Set(positives.flatMap((sample) => references(sample).map((ref) => String(ref.origin))))
  expect([...origins]).toEqual(['manual-or-seed'])
})

test('model input carries only public post fields and never a D1 event value', () => {
  const publicKeys = new Set([
    'id',
    'createdAt',
    'screenName',
    'kind',
    'text',
    'url',
    'replyTo',
    'quoted',
    'retweeted',
    'media'
  ])
  for (const sample of positives) {
    const model = goalModelPost(sample)
    expect(Object.keys(model).every((key) => publicKeys.has(key))).toBe(true)
    const json = JSON.stringify(model)
    for (const ref of references(sample)) {
      expect(json).not.toContain(String(ref.eventId))
      expect(json).not.toContain('referenceOnly')
    }
  }
})

test('a sentinel planted in a D1 reference never reaches the model projection', () => {
  const sentinel = 'D1_EVENT_SENTINEL_NEVER_SEND_TO_MODEL_55820'
  const sample = positives[0]
  if (sample === undefined) throw new Error('corpus is empty')
  const poisoned = {
    ...sample,
    observedD1: { ...sample.observedD1, referencedEvents: [{ title: sentinel, referenceOnly: { note: sentinel } }] }
  }
  expect(JSON.stringify(goalModelPost(poisoned))).not.toContain(sentinel)
})

test('unannotated gold fields stay null and confirmed fields are limited to what the text supports', () => {
  for (const sample of corpus.cases)
    for (const field of sample.stageGold.unannotatedFields) expect(Reflect.get(sample.expected, field)).toBeNull()
  const confirmed = (field: string) => positives.filter((sample) => Reflect.get(sample.expected, field) !== null).length
  expect(['category', 'stores', 'characterIds', 'startDate', 'conditions'].map(confirmed)).toEqual([71, 11, 67, 47, 19])
  for (const sample of positives)
    for (const item of sample.stageGold.items)
      for (const evidence of item.evidence) expect(sample.post.text).toContain(evidence)
})

test('the matched selection uses every pair and leaves the frozen goal selection untouched', async () => {
  const selected = selectAnnotatedGoalCohort(corpus.cases, 200, 'd1-anchored-v1-check', 'annotated-d1-anchored-v1')
  expect([selected.positive, selected.negative]).toEqual([100, 100])
  const goal = selectAnnotatedGoalCohort((await loadAnnotatedGoalCorpus()).cases, 100, 'goal-pipeline-v1')
  expect(goal.inputHash).toBe('12bc2dc03fcc2d710e092145b17111a111a8b3948483c691e15e086543ac4be3')
})

test('the provenance records the pool, exclusions and the same-family cases that must share a holdout side', async () => {
  const raw: unknown = JSON.parse(await readFile(join(D1_ANCHORED_CORPUS_DIRECTORY, 'provenance.json'), 'utf8'))
  const anchoring = D1AnchoringSchema.safeParse(Object(raw).d1Anchoring)
  expect(anchoring.success).toBe(true)
  if (!anchoring.success) return
  const pool = anchoring.data.candidatePool
  const excluded = Object.values(anchoring.data.exclusions).reduce((sum, count) => sum + count, 0)
  const annotated = pool.annotatedAsEventFromText
  if (annotated === undefined) throw new Error('annotatedAsEventFromText is missing')
  expect(pool.distinctXStatusIds).toBe(annotated + excluded)
  expect(anchoring.data.templateFamilies.length).toBeGreaterThan(0)
})
