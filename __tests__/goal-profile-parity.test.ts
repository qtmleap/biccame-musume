import { expect, test } from 'bun:test'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import * as detection from '@biccame/shared/event-detect/detection'
import * as extraction from '@biccame/shared/event-detect/extraction'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { GoalPipelineModule } from '../scripts/lib/event-detect/goal-pipeline-module'
import { GOAL_PIPELINE_PROFILE } from '../scripts/lib/event-detect/goal-pipeline-profile'
import { runGoalPipeline } from '../scripts/lib/event-detect/goal-pipeline-run'

const post: DetectPost = {
  id: '1000000000000000000',
  screenName: 'bic_yuurakuchou',
  kind: 'original',
  url: 'https://x.com/bic_yuurakuchou/status/1000000000000000000',
  createdAt: '2026-10-20T00:00:00Z',
  text: '有楽町たんの名刺を有楽町店で配布。あべのたんアクキーはあべの店で3000円以上購入特典。',
  media: []
}
const events = [
  {
    item: '名刺',
    stores: ['yuurakuchou'],
    characterIds: ['yuurakuchou'],
    evidence: ['有楽町たんの名刺を有楽町店で配布。']
  },
  {
    item: 'アクキー',
    stores: ['abeno'],
    characterIds: [],
    evidence: ['あべのたんアクキーはあべの店で3000円以上購入特典。']
  }
]
const runCase = async (status: 'matched' | 'mismatch' | 'low_confidence', topic = false, sameName = false) => {
  const captured: {
    post: DetectPost
    model: ClefRequest['model'] | undefined
    storeKey: string | null | undefined
    requests: unknown
  }[] = []
  const thresholds: unknown[] = []
  const rows = topic ? [] : sameName ? events.map((event) => ({ ...event, item: '名刺' })) : events
  const module: GoalPipelineModule = {
    ...detection,
    ...extraction,
    sha256: 'current-unit-source',
    extractWebhookEvents: async () => ({ events: rows }),
    auditItemCount: (input, _response, threshold) => {
      expect(threshold).toBe(GOAL_PIPELINE_PROFILE.choiceThreshold)
      return {
        version: 'fixture',
        expected: rows.length,
        probability: status === 'low_confidence' ? 0.6 : 0.99,
        threshold,
        extracted: input.length,
        candidates: input.length,
        status
      }
    },
    extractedPost: (source, event) => {
      const parsed = extraction.EventExtractionSchema.safeParse({ events: [event] })
      if (!parsed.success) throw new Error('Invalid test event')
      return extraction.extractedPost(source, parsed.data.events[0])
    },
    extractionCandidateInputs: (source, value) => {
      const parsed = extraction.EventExtractionSchema.safeParse(value)
      if (!parsed.success) throw new Error('Invalid test extraction')
      return extraction.extractionCandidateInputs(source, parsed.data).toReversed()
    },
    createDetectionRequests: (focused, model, storeKey) => {
      const requests = detection.createDetectionRequests(focused, model, storeKey)
      captured.push({ post: focused, model, storeKey, requests })
      return requests
    },
    evaluateDetection: (_focused, _request, _response, profile, storeKey) => {
      thresholds.push(profile)
      expect(storeKey).toBe(captured.at(-1)?.storeKey)
      return { status: 'held', confidence: 0.6, reasons: ['fixture'] }
    },
    buildDetectionDraft: () => ({ stores: [], characterIds: [], conditions: [] }),
    describeDetectionOutcome: (_focused, _answers, _decision, profile) => {
      thresholds.push(profile)
      return { discovery: { status: 'uncertain', confidence: 0.6, evidence: [] }, action: 'review', missingFields: [] }
    }
  }
  const result = await runGoalPipeline({
    module,
    post,
    run: async (request) => ({
      answers: Object.fromEntries(
        Object.entries(request.questions).map(([key, question]) => [
          key,
          question.type === 'noul'
            ? { type: 'noul', noul: 0.6 }
            : question.type === 'choice'
              ? {
                  type: 'choice',
                  choice: Object.keys(question.criteria)[0],
                  probabilities: Object.fromEntries(Object.keys(question.criteria).map((choice) => [choice, 0.6]))
                }
              : { type: 'score', score: 0 }
        ])
      )
    }),
    extractionFetcher: async () => Response.json({})
  })
  return { captured, thresholds, result }
}

for (const status of ['matched', 'mismatch', 'low_confidence'] as const) {
  test(`pipeline request/profile parity uses item identity after reorder: ${status}`, async () => {
    const { captured, thresholds, result } = await runCase(status)
    expect(captured.map((row) => row.storeKey)).toEqual(['abeno', 'yuurakuchou'])
    for (const row of captured) {
      expect(row.model).toBe('clef')
      expect(row.requests).toEqual(detection.createDetectionRequests(row.post, 'clef', row.storeKey))
    }
    expect(result.stopped).toBe(false)
    expect(thresholds.every((value) => value === GOAL_PIPELINE_PROFILE.thresholds)).toBe(true)
    expect(GOAL_PIPELINE_PROFILE.thresholds.fieldThresholds.category).toBe(0.85)
    expect(GOAL_PIPELINE_PROFILE.thresholds.fieldThresholds.status).toBe(0.8)
  })
}

test('same-name items at different stores keep candidate-local hints after reorder', async () => {
  const { captured } = await runCase('matched', false, true)
  expect(captured.map((row) => row.storeKey)).toEqual(['abeno', 'yuurakuchou'])
})

test('topic fallback has no borrowed store hint and keeps the frozen runtime profile', async () => {
  const { captured } = await runCase('matched', true)
  expect(captured).toHaveLength(1)
  expect(captured[0].storeKey).toBeNull()
  expect(GOAL_PIPELINE_PROFILE.provenance).toBe('allowlisted-local-worker-runtime-snapshot-frozen-for-both-arms')
})
