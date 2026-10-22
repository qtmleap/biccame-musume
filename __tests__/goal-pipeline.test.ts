import { expect, test } from 'bun:test'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { BenchmarkCase } from '../scripts/lib/event-detect/benchmark-schema'
import { compareGoalDiscovery } from '../scripts/lib/event-detect/goal-pipeline-compare'
import type { GoalPipelineModule } from '../scripts/lib/event-detect/goal-pipeline-module'
import { runGoalPipeline } from '../scripts/lib/event-detect/goal-pipeline-run'
import { scoreGoalPipeline } from '../scripts/lib/event-detect/goal-pipeline-score'

const post: DetectPost = {
  id: '1000000000000000000',
  screenName: 'bic_yuurakuchou',
  kind: 'original',
  url: 'https://x.com/bic_yuurakuchou/status/1000000000000000000',
  createdAt: '2026-10-20T00:00:00Z',
  text: '名刺は全員。アクキーは3000円以上購入。',
  media: []
}
const extraction = {
  events: [
    { item: '名刺', stores: ['yuurakuchou'], characterIds: ['yuurakuchou'], evidence: ['名刺は全員。'] },
    {
      item: 'アクキー',
      stores: ['yuurakuchou'],
      characterIds: ['yuurakuchou'],
      evidence: ['アクキーは3000円以上購入。']
    }
  ]
}
const request = (text: string): ClefRequest => ({
  model: 'clef',
  state: text,
  questions: { is_event: { type: 'noul', instructions: '関連企画か' } }
})
const moduleOf = (status: 'matched' | 'low_confidence', retaining = false): GoalPipelineModule => ({
  DETECTION_VERSION: 'fixture-v1',
  EXTRACTION_VERSION: 'fixture-extraction-v1',
  sha256: 'fixture',
  createDetectionRequests: (focused) => [request(focused.text)],
  createItemCountRequest: () => request(post.text),
  auditItemCount: (events) => ({
    version: 'fixture-audit',
    expected: 2,
    probability: status === 'matched' ? 0.99 : 0.6,
    threshold: 0.9,
    extracted: events.length,
    candidates: events.length,
    status
  }),
  validateEventExtraction: (_post, raw) => raw,
  extractedPost: (source, item) => ({ ...source, text: item.evidence.join('\n') }),
  evaluateDetection: () => ({ status: 'held', confidence: 0.99, reasons: ['fixture_missing_start'] }),
  buildDetectionDraft: () => ({ stores: ['yuurakuchou'], characterIds: ['yuurakuchou'], conditions: [] }),
  extractWebhookEvents: async (_env, _post, fetcher) =>
    await (await fetcher('https://benchmark.invalid', { method: 'POST', body: 'fixture' })).json(),
  extractionCandidateInputs: retaining
    ? (source, extracted) =>
        extracted.events.map((item) => ({
          item: item.item,
          stores: item.stores,
          post: { ...source, text: item.evidence.join('\n') }
        }))
    : undefined
})
const run = async () => ({ answers: { is_event: { type: 'noul' as const, noul: 0.99 } } })

test('pipeline judges each extracted item using focused evidence instead of one full-post category', async () => {
  const states: string[] = []
  const result = await runGoalPipeline({
    module: moduleOf('matched'),
    post,
    run: async (input) => {
      states.push(input.state)
      return await run()
    },
    extractionFetcher: async () => Response.json(extraction)
  })
  expect(states).toEqual([post.text, '名刺は全員。', 'アクキーは3000円以上購入。'])
  expect(result.judgements).toHaveLength(2)
  expect(result.judgements.map((value) => value.item)).toEqual(['名刺', 'アクキー'])
  expect(result.calls).toBe(4)
  expect(result.judgements.every((value) => value.decision.status === 'held')).toBe(true)
})

test('paired comparison retains failed extractions in the positive denominator', () => {
  const labels = Array.from({ length: 8 }, (_, index) => ({ id: `pair-${index}`, expected: { isEvent: true } }))
  const before = labels.map((sample) => ({ id: sample.id, result: null }))
  const after = labels.map((sample) => ({ id: sample.id, result: { gold: true, outcome: 'detected' } }))
  const paired = compareGoalDiscovery(before, after, labels)
  expect(paired.positivePairs).toBe(8)
  expect(paired.gained).toBe(8)
  expect(paired.oldUnavailable).toBe(8)
  expect(paired.exactTwoSidedP).toBeLessThan(0.05)
})

test('strict baseline audit failure prevents candidate judgement and is not a model false negative', async () => {
  const result = await runGoalPipeline({
    module: moduleOf('low_confidence'),
    post,
    run,
    extractionFetcher: async () => Response.json(extraction)
  })
  expect(result.stopped).toBe(true)
  expect(result.judgements).toHaveLength(0)
  expect(result.stopReasons).toEqual(['distribution_item_count_low_confidence'])
  expect(result.calls).toBe(2)
})

test('a detected flag without matching grounded evidence does not inflate detection score', async () => {
  const module = {
    ...moduleOf('matched'),
    describeDetectionOutcome: () => ({
      discovery: { status: 'detected', confidence: 0.6, evidence: ['unsupported_claim'] },
      action: 'review',
      missingFields: []
    }),
    groundedDiscoveryEvidence: () => []
  }
  const result = await runGoalPipeline({
    module,
    post,
    run: async () => ({ answers: { is_event: { type: 'noul' as const, noul: 0.6 } } }),
    extractionFetcher: async () => Response.json(extraction)
  })
  const sample: BenchmarkCase = {
    id: 'evidence-fixture',
    source: 'synthetic',
    description: '根拠なしのflagを採点しない',
    post,
    expected: {
      isEvent: true,
      status: null,
      category: null,
      stores: null,
      characterIds: null,
      startDate: null,
      conditions: null
    },
    rationale: 'テスト用の明示的な配布案内',
    tags: [],
    group: 'evidence-fixture',
    reviewStatus: 'provisional'
  }
  const score = scoreGoalPipeline(sample, result)
  expect(score.truePositive).toBe(false)
  expect(score.outcome).toBe('review')
})

test('review-retaining audit keeps extracted evidence without pretending it is automatically registered', async () => {
  const result = await runGoalPipeline({
    module: moduleOf('low_confidence', true),
    post,
    run,
    extractionFetcher: async () => Response.json(extraction)
  })
  expect(result.stopped).toBe(false)
  expect(result.stopReasons).toEqual(['distribution_item_count_low_confidence'])
  expect(result.judgements).toHaveLength(2)
  expect(result.judgements.every((value) => value.decision.status === 'held')).toBe(true)
})
