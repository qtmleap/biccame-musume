import { expect, test } from 'bun:test'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import {
  loadAnnotatedGoalCorpus,
  selectAnnotatedGoalCohort
} from '../scripts/lib/event-detect/goal-pipeline-goal-corpus'
import { goalModelPost } from '../scripts/lib/event-detect/goal-pipeline-input'
import type { GoalPipelineModule } from '../scripts/lib/event-detect/goal-pipeline-module'
import { runGoalPipeline } from '../scripts/lib/event-detect/goal-pipeline-run'

const sentinel = 'ANNOTATION_SENTINEL_NEVER_SEND_TO_MODEL_93731'
const post = {
  id: '1000000000000000000',
  screenName: 'bic_yuurakuchou',
  kind: 'original' as const,
  createdAt: '2026-10-20T00:00:00Z',
  url: 'https://x.com/bic_yuurakuchou/status/1000000000000000000',
  text: '有楽町たん名刺を配布します。',
  media: []
}

test('AI projection strips expected, stageGold and observedD1 including stray nested annotation fields', () => {
  const sample = {
    post: {
      ...post,
      expected: sentinel,
      stageGold: sentinel,
      observedD1: sentinel,
      extractionContext: { kind: 'event', item: sentinel, evidence: [sentinel], originalText: sentinel }
    },
    expected: { isEvent: true, marker: sentinel },
    stageGold: { marker: sentinel },
    observedD1: { marker: sentinel }
  }
  const model = goalModelPost(sample)
  expect(JSON.stringify(model)).not.toContain(sentinel)
  expect(model).toEqual(post)
  expect(model).not.toHaveProperty('extractionContext')
})

test('count, extraction and focused judge inputs never contain gold or historical D1 sentinel', async () => {
  const sample = {
    post,
    expected: { marker: sentinel },
    stageGold: { marker: sentinel },
    observedD1: { marker: sentinel }
  }
  const inputs: string[] = []
  const request = (text: string): ClefRequest => ({
    model: 'clef',
    state: text,
    questions: { is_event: { type: 'noul', instructions: '企画か' } }
  })
  const module: GoalPipelineModule = {
    sha256: 'fixture',
    DETECTION_VERSION: 'fixture',
    EXTRACTION_VERSION: 'fixture',
    createItemCountRequest: (source) => {
      inputs.push(JSON.stringify(source))
      return request(source.text)
    },
    createDetectionRequests: (source) => {
      inputs.push(JSON.stringify(source))
      return [request(source.text)]
    },
    extractWebhookEvents: async (_env, source, fetcher) =>
      await (await fetcher('https://benchmark.invalid', { method: 'POST', body: JSON.stringify({ source }) })).json(),
    validateEventExtraction: (_source, raw) => raw,
    auditItemCount: () => ({
      version: 'fixture',
      expected: 1,
      probability: 0.99,
      threshold: 0.9,
      extracted: 1,
      candidates: 1,
      status: 'matched'
    }),
    extractedPost: (source, item) => ({ ...source, text: item.evidence.join('\n') }),
    evaluateDetection: () => ({ status: 'held', confidence: 0.99, reasons: ['fixture_missing_date'] }),
    buildDetectionDraft: () => ({})
  }
  const result = await runGoalPipeline({
    module,
    post: goalModelPost(sample),
    run: async (input) => {
      inputs.push(JSON.stringify(input))
      return { answers: { is_event: { type: 'noul', noul: 0.99 } } }
    },
    extractionFetcher: async (_url, init) => {
      inputs.push(String(init.body))
      return Response.json({
        events: [{ item: '名刺', stores: ['yuurakuchou'], characterIds: ['yuurakuchou'], evidence: [post.text] }]
      })
    }
  })
  expect(result.judgements).toHaveLength(1)
  expect(inputs.length).toBeGreaterThanOrEqual(5)
  for (const input of inputs) expect(input).not.toContain(sentinel)
})

test('goal236 selection freezes 50 positive and 50 negative with month-account pairs', async () => {
  const corpus = await loadAnnotatedGoalCorpus()
  expect(corpus.cases).toHaveLength(236)
  const selected = selectAnnotatedGoalCohort(corpus.cases, 100)
  expect(selected.positive).toBe(50)
  expect(selected.negative).toBe(50)
  expect(new Set(selected.cases.map((sample) => sample.group)).size).toBe(100)
  for (const pair of selected.selection.pairs) {
    const positive = selected.cases.find((sample) => sample.id === pair.positive)
    const negative = selected.cases.find((sample) => sample.id === pair.negative)
    expect(positive?.post.createdAt.slice(0, 7)).toBe(negative?.post.createdAt.slice(0, 7))
    expect(positive?.post.screenName.toLowerCase()).toBe(negative?.post.screenName.toLowerCase())
  }
  expect(
    selected.cases.every(
      (sample) =>
        sample.stageGold !== undefined && sample.observedD1.annotationUse === 'diagnostic-only-not-gold-not-model-input'
    )
  ).toBe(true)
})
