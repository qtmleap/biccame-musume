import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ClefRequest, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { createDetectionRequests, DetectionResultSchema } from '@biccame/shared/event-detect/detection'
import { eventBenchmarkCases } from '../scripts/lib/event-detect/benchmark-cases'
import { benchmarkRequestHash, verifyBenchmarkCheckpoint } from '../scripts/lib/event-detect/benchmark-checkpoint'
import { runBenchmarkCohort } from '../scripts/lib/event-detect/benchmark-cohort-run'
import {
  loadBenchmarkCorpus,
  selectBenchmarkHoldout,
  validateBenchmarkCorpus
} from '../scripts/lib/event-detect/benchmark-corpus'
import { frozenBenchmarkSelection } from '../scripts/lib/event-detect/benchmark-frozen-selection'
import { summarizeBenchmarkCohort } from '../scripts/lib/event-detect/benchmark-metrics'
import { reviseBoundaryHoldout } from '../scripts/lib/event-detect/benchmark-revision'
import { BenchmarkCaseSchema } from '../scripts/lib/event-detect/benchmark-schema'
import { scoreBenchmarkDecision } from '../scripts/lib/event-detect/benchmark-score'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
const sampleOf = (index: number, positive = true) => {
  const original = eventBenchmarkCases[0]
  const parsed = BenchmarkCaseSchema.safeParse({
    ...original,
    id: `unit-${index}`,
    source: 'synthetic',
    post: {
      ...original.post,
      id: String(9000000000000000000n + BigInt(index)),
      text: `${original.post.text}\n検証対象${index}`
    },
    expected: { isEvent: positive },
    rationale: '外部AIを使わないrunnerの構造テスト',
    tags: ['unit'],
    group: `unit-group-${index}`,
    reviewStatus: 'provisional'
  })
  if (!parsed.success) throw new Error('Invalid unit corpus fixture')
  return parsed.data
}
const ignored = () => {
  const parsed = DetectionResultSchema.safeParse({
    status: 'ignored',
    confidence: 0.01,
    reasons: ['not_distribution_event']
  })
  if (!parsed.success) throw new Error('Invalid decision fixture')
  return parsed.data
}
const respond = (request: ClefRequest) => {
  const answers = Object.fromEntries(
    Object.entries(request.questions).map(([key, question]) => {
      if (question.type === 'noul')
        return [
          key,
          {
            type: 'noul',
            noul: key === 'is_event' ? 0.99 : 0.01
          }
        ]
      if (question.type === 'score') return [key, { type: 'score', score: 0 }]
      const choice = Object.keys(question.criteria).find((value) => value !== 'none')
      if (choice === undefined) throw new Error('Missing choice fixture')
      return [
        key,
        {
          type: 'choice',
          choice,
          probabilities: Object.fromEntries(
            Object.keys(question.criteria).map((value) => [value, value === choice ? 1 : 0])
          )
        }
      ]
    })
  )
  const parsed = ClefResponseSchema.safeParse({ answers })
  if (!parsed.success) throw new Error('Invalid mocked model response')
  return parsed.data
}

test('real corpus contains at least 100 independent non-development holdout examples', async () => {
  const corpus = await loadBenchmarkCorpus()
  expect(corpus.cases.length).toBeGreaterThanOrEqual(100)
  const holdout = selectBenchmarkHoldout(corpus.cases)
  expect(holdout.cases).toHaveLength(100)
  expect(new Set(holdout.cases.map((sample) => sample.group)).size).toBe(100)
  expect(
    holdout.cases.some((sample) =>
      [
        '2112392477038780586',
        '2112431406978945270',
        '2112435987582513432',
        '2111633864368210298',
        '2110626732063805924'
      ].includes(sample.post.id)
    )
  ).toBe(false)
  expect(selectBenchmarkHoldout(corpus.cases).cases.map((sample) => sample.id)).toEqual(
    holdout.cases.map((sample) => sample.id)
  )
  expect(holdout.cases.every((sample) => sample.reviewStatus === 'provisional')).toBe(true)
})

test('normalized duplicate text is removed and unannotated fields remain null', () => {
  const a = sampleOf(1)
  const b = { ...sampleOf(2), post: { ...sampleOf(2).post, text: `  ${a.post.text.replaceAll('\n', ' ')} ` } }
  const corpus = validateBenchmarkCorpus([a, b])
  expect(corpus.cases).toHaveLength(1)
  expect(corpus.duplicates).toEqual([{ id: b.id, reason: 'normalized-text' }])
  expect(corpus.cases[0].expected.category).toBeNull()
  expect(corpus.cases[0].expected.stores).toBeNull()
})

test('development campaign siblings cannot leak into holdout', () => {
  const rows = Array.from({ length: 102 }, (_, index) => sampleOf(index))
  const development = { ...rows[0], post: { ...rows[0].post, id: '2112392477038780586' } }
  const sibling = { ...rows[1], group: development.group }
  const selected = selectBenchmarkHoldout([development, sibling, ...rows.slice(2)])
  expect(selected.cases).toHaveLength(100)
  expect(selected.cases.some((sample) => sample.group === development.group)).toBe(false)
  expect(() => selectBenchmarkHoldout(rows.slice(0, 99))).toThrow('need 100')
  expect(BenchmarkCaseSchema.safeParse({ ...sampleOf(1), id: '../../outside' }).success).toBe(false)
})

test('boundary posts are excluded without changing legacy frozen selection provenance', () => {
  const rows = Array.from({ length: 102 }, (_, index) => sampleOf(index))
  const boundary = [
    { ...rows[0], post: { ...rows[0].post, id: '2111633864368210298' } },
    { ...rows[1], post: { ...rows[1].post, id: '2110626732063805924' } }
  ]
  const selected = selectBenchmarkHoldout([...boundary, ...rows.slice(2)])
  expect(selected.cases).toHaveLength(100)
  expect(selected.excluded.filter((row) => row.reason === 'boundary')).toHaveLength(2)
  const old = frozenBenchmarkSelection(rows.slice(0, 100), 'old-seed')
  expect(old.available).toBeNull()
  expect(old.excluded).toBeNull()
})

test('audit revision retains 99 cases and selects only an unused independent replacement', () => {
  const rows = Array.from({ length: 100 }, (_, index) => sampleOf(index))
  const original = [{ ...rows[0], post: { ...rows[0].post, id: '2110626732063805924' } }, ...rows.slice(1)]
  const replacement = sampleOf(100, false)
  const revision = reviseBoundaryHoldout(original, [...original, replacement], 'audit-seed')
  expect(revision.retained).toEqual(original.slice(1))
  expect(revision.cases).toHaveLength(100)
  expect(revision.removed.post.id).toBe('2110626732063805924')
  expect(revision.added.id).toBe(replacement.id)
  expect(revision.added.expected.isEvent).toBe(false)
  expect(reviseBoundaryHoldout(original, [...original, replacement], 'audit-seed').added.id).toBe(replacement.id)
  expect(() =>
    reviseBoundaryHoldout(original, [...original, { ...replacement, group: rows[1].group }], 'audit-seed')
  ).toThrow('No unused')
})

test('saved request hashes and model must match the frozen case before response reuse', () => {
  const sample = sampleOf(1)
  const requests = createDetectionRequests(sample.post)
  const requestHash = benchmarkRequestHash(requests)
  expect(verifyBenchmarkCheckpoint(sample, { requests, requestHash }).requestHash).toBe(requestHash)
  const differentText = requests.map((request, index) =>
    index === 0 ? { ...request, state: `${request.state} changed` } : request
  )
  expect(() => verifyBenchmarkCheckpoint(sample, { requests: differentText })).toThrow('request hash mismatch')
  const differentModel = requests.map((request) => ({ ...request, model: 'clef-flash' as const }))
  expect(() => verifyBenchmarkCheckpoint(sample, { requests: differentModel })).toThrow('model mismatch')
  expect(() => verifyBenchmarkCheckpoint(sample, { requests, requestHash: 'incorrect' })).toThrow(
    'request hash mismatch'
  )
  expect(() => verifyBenchmarkCheckpoint(sample, { requests, requestHash, model: 'clef-flash' })).toThrow(
    'model mismatch'
  )
})

test('errors and positive abstentions remain in recall and field denominators', () => {
  const positive = sampleOf(1)
  const negative = sampleOf(2, false)
  const held = { status: 'held' as const, confidence: 0.66, reasons: ['event_confidence_below_threshold'] }
  const positiveScore = scoreBenchmarkDecision(positive, held)
  const negativeScore = scoreBenchmarkDecision(negative, ignored())
  const summary = summarizeBenchmarkCohort(
    [positive, negative],
    [
      { id: positive.id, calls: 2, score: positiveScore, error: null },
      { id: negative.id, calls: 2, score: negativeScore, error: null }
    ]
  )
  expect(summary.event).toMatchObject({
    positive: 1,
    negative: 1,
    tp: 0,
    fn: 1,
    tn: 1,
    abstained: 1,
    recall: 0,
    coverage: 0.5,
    accuracy: 0.5
  })
  expect(summary.fields.category.annotated).toBe(0)
  const failure = summarizeBenchmarkCohort(
    [positive, negative],
    [{ id: positive.id, calls: 1, score: null, error: 'model failure' }]
  )
  expect(failure).toMatchObject({ total: 2, errors: 1, missing: 1 })
  expect(failure.event).toMatchObject({ fn: 1, abstained: 2, recall: 0, coverage: 0 })
})

test('cohort checkpoints resume without repeating calls and enforce a frozen version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'event-cohort-'))
  directories.push(directory)
  const calls: number[] = []
  const cases = Array.from({ length: 100 }, (_, index) => sampleOf(index))
  const input = {
    cases,
    seed: 'unit-seed',
    directory,
    // 実行器は1件あたり2回分の上限を前提に予算を検査する（benchmark-cohort-run.ts）。実際の呼び出しは1件1回。
    maxCalls: 200,
    concurrency: 2,
    maxDurationMs: 60_000,
    run: async (request: ClefRequest) => {
      calls.push(1)
      return respond(request)
    }
  }
  const original = console.log
  console.log = () => undefined
  try {
    const first = await runBenchmarkCohort(input)
    expect(first.completed).toBe(100)
    // 1 件につき 1 バッチ（質問は 1 リクエストにまとまる）なので、100 件で 100 回。
    expect(first.calls).toBe(100)
    expect(calls).toHaveLength(100)
    const second = await runBenchmarkCohort(input)
    expect(second.completed).toBe(100)
    expect(calls).toHaveLength(100)
    const checkpointPath = join(directory, `${cases[0].id}.json`)
    const checkpointBytes = await readFile(checkpointPath, 'utf8')
    const checkpoint = JSON.parse(checkpointBytes)
    await writeFile(checkpointPath, JSON.stringify({ ...checkpoint, requestHash: 'tampered' }))
    await expect(runBenchmarkCohort(input)).rejects.toThrow('request hash mismatch')
    await writeFile(checkpointPath, JSON.stringify({ ...checkpoint, model: 'clef-flash' }))
    await expect(runBenchmarkCohort(input)).rejects.toThrow('model mismatch')
    expect(calls).toHaveLength(100)
    await writeFile(checkpointPath, checkpointBytes)
    await expect(runBenchmarkCohort({ ...input, seed: 'different' })).rejects.toThrow('Resume manifest')
    await expect(runBenchmarkCohort({ ...input, maxCalls: 199 })).rejects.toThrow('Call budget')
    await expect(
      runBenchmarkCohort({ ...input, cases: [{ ...cases[0], id: '../escape' }, ...cases.slice(1)] })
    ).rejects.toThrow('unsafe case id')
    await expect(runBenchmarkCohort({ ...input, maxDurationMs: Number.NaN })).rejects.toThrow(
      'Duration must be bounded'
    )
    const manifestPath = join(directory, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    await writeFile(manifestPath, JSON.stringify({ ...manifest, version: 'old-version' }))
    await expect(runBenchmarkCohort(input)).rejects.toThrow('Resume manifest')
  } finally {
    console.log = original
  }
}, 30000)

test('interrupted attempts are recorded as errors and never resent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'event-cohort-interrupted-'))
  directories.push(directory)
  const cases = Array.from({ length: 100 }, (_, index) => sampleOf(index))
  await writeFile(join(directory, `${cases[0].id}.attempt.json`), JSON.stringify({ calls: 1 }))
  const calls: number[] = []
  const original = console.log
  console.log = () => undefined
  try {
    const result = await runBenchmarkCohort({
      cases,
      seed: 'interrupted',
      directory,
      maxCalls: 200,
      concurrency: 2,
      maxDurationMs: 60_000,
      run: async (request) => {
        calls.push(1)
        return respond(request)
      }
    })
    expect(calls).toHaveLength(99)
    expect(result.calls).toBe(100)
    expect(result.errors).toBe(1)
    expect(result.total).toBe(100)
  } finally {
    console.log = original
  }
}, 30000)
