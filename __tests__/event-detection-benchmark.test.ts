import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { DetectionResultSchema } from '@biccame/shared/event-detect/detection'
import { readBenchmarkBaseline, readBenchmarkBaselineSnapshot } from '../scripts/lib/event-detect/benchmark-baseline'
import { eventBenchmarkCases } from '../scripts/lib/event-detect/benchmark-cases'
import { runBenchmarkComparison } from '../scripts/lib/event-detect/benchmark-run'
import {
  benchmarkSignals,
  scoreBenchmarkDecision,
  summarizeBenchmark
} from '../scripts/lib/event-detect/benchmark-score'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
const request: ClefRequest = {
  model: 'clef',
  state: '固定した公開投稿',
  questions: { is_event: { type: 'noul', instructions: 'イベントですか？' } }
}

const positiveResult = () => {
  const result = DetectionResultSchema.safeParse({
    status: 'register',
    confidence: 0.99,
    reasons: [],
    candidate: {
      category: 'other',
      title: '25周年記念ギフトカード',
      stores: ['yuurakuchou'],
      characterIds: ['yuurakuchou'],
      startDate: '2026-10-24',
      conditions: [
        { type: 'charge', chargeAmount: 1000 },
        { type: 'first_come', quantity: 55 }
      ],
      referenceUrls: [{ type: 'announce', url: eventBenchmarkCases[0].post.url }],
      isPreliminary: false
    }
  })
  if (!result.success) throw new Error('Invalid benchmark result fixture')
  return result.data
}

test('benchmark has explicit positive and negative labels without predicting results offline', () => {
  expect(eventBenchmarkCases).toHaveLength(5)
  expect(eventBenchmarkCases.filter((sample) => sample.expected.status === 'register')).toHaveLength(2)
  expect(eventBenchmarkCases.filter((sample) => sample.expected.status === 'ignored')).toHaveLength(3)
  expect(eventBenchmarkCases[0].expected.conditions).toEqual([
    { type: 'charge', amount: 1000 },
    { type: 'first_come', quantity: 55 }
  ])
})

test('score requires the full independent venue, character and charge semantics', () => {
  const sample = eventBenchmarkCases[0]
  const result = positiveResult()
  expect(scoreBenchmarkDecision(sample, result).passed).toBe(true)
  if (result.status !== 'register') throw new Error('Expected registration fixture')
  const held = scoreBenchmarkDecision(
    sample,
    { status: 'held', confidence: 0.98, reasons: ['category_unconfirmed'] },
    result.candidate
  )
  expect(held.observationSource).toBe('draft')
  expect(held.checks.status).toBe(false)
  expect(held.checks.conditions).toBe(true)
  expect(held.passed).toBe(false)
  const wrong = {
    ...result,
    candidate: {
      ...result.candidate,
      conditions: [
        { type: 'purchase' as const, purchaseAmount: 1000 },
        { type: 'first_come' as const, quantity: 55 }
      ]
    }
  }
  expect(scoreBenchmarkDecision(sample, wrong).checks.conditions).toBe(false)
  expect(
    scoreBenchmarkDecision(sample, { ...result, candidate: { ...result.candidate, characterIds: ['funabashi'] } })
      .checks.characterIds
  ).toBe(false)
  expect(
    scoreBenchmarkDecision(sample, { status: 'held', confidence: 0.66, reasons: ['event_confidence_below_threshold'] })
      .passed
  ).toBe(false)
})

test('negative cases are scored by rejection, not by missing positive-only fields', () => {
  const sample = eventBenchmarkCases[2]
  const score = scoreBenchmarkDecision(sample, {
    status: 'ignored',
    confidence: 0.1,
    reasons: ['not_distribution_event']
  })
  expect(score.checks).toEqual({ status: true })
  expect(score.passed).toBe(true)
  expect(summarizeBenchmark([score])).toEqual({ total: 1, passed: 1, failed: 0, accuracy: 1 })
  expect(summarizeBenchmark([]).accuracy).toBeNull()
})

test('live comparison executes each old/new batch once and never exceeds four calls', async () => {
  const calls: ClefRequest[] = []
  const result = await runBenchmarkComparison(
    eventBenchmarkCases[2],
    [request, request],
    [request, request],
    async (value) => {
      calls.push(value)
      return { answers: { is_event: { type: 'noul', noul: 0.01 } } }
    }
  )
  expect(calls).toHaveLength(4)
  expect(result.calls).toBe(4)
  expect(result.before.score.passed).toBe(true)
  expect(result.after.score.passed).toBe(true)
  await expect(
    runBenchmarkComparison(eventBenchmarkCases[0], [request, request, request], [request, request], async () => {
      throw new Error('Must not call model')
    })
  ).rejects.toThrow('four-call budget')
})

test('incomplete model output fails without inventing another batch or retry', async () => {
  const calls: number[] = []
  await expect(
    runBenchmarkComparison(eventBenchmarkCases[0], [request], [request], async () => {
      calls.push(1)
      return { answers: {} }
    })
  ).rejects.toThrow('Incomplete benchmark model response')
  expect(calls).toHaveLength(1)
  expect(benchmarkSignals({ answers: { is_event: { type: 'noul', noul: 0.66 } } })).toEqual({
    is_event: { answer: 'yes', probability: 0.66 }
  })
})

test('saved baseline is loaded read-only and stored decisions are not recomputed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'event-benchmark-'))
  directories.push(directory)
  const path = join(directory, 'baseline.sqlite')
  const database = new Database(path)
  database.exec(
    'CREATE TABLE webhook_event_candidates(event_uuid TEXT, post_id TEXT, post_json TEXT, result_json TEXT, answers_json TEXT, requests_json TEXT)'
  )
  const decision = { status: 'held' as const, confidence: 0.66, reasons: ['old_reason'] }
  database
    .query('INSERT INTO webhook_event_candidates VALUES (?,?,?,?,?,?)')
    .run(
      'candidate',
      eventBenchmarkCases[0].post.id,
      JSON.stringify(eventBenchmarkCases[0].post),
      JSON.stringify(decision),
      JSON.stringify({ is_event: { type: 'noul', noul: 0.66 } }),
      JSON.stringify({ questionVersion: 'old-version', requests: [request] })
    )
  database.close()
  const baseline = readBenchmarkBaseline(path, eventBenchmarkCases[0].post.id)
  expect(baseline.decision).toEqual(decision)
  const frozenPath = join(directory, 'frozen.json')
  await Bun.write(frozenPath, JSON.stringify(baseline))
  expect(await readBenchmarkBaselineSnapshot(frozenPath)).toEqual(baseline)
  await Bun.write(frozenPath, '{}')
  await expect(readBenchmarkBaselineSnapshot(frozenPath)).rejects.toThrow('Invalid frozen benchmark baseline')
  const saved = new Database(path, { readonly: true })
  try {
    expect(saved.query('SELECT count(*) AS count FROM webhook_event_candidates').get()).toEqual({ count: 1 })
  } finally {
    saved.close()
  }
  expect(() => readBenchmarkBaseline(path, 'missing')).toThrow('exactly one')
})
