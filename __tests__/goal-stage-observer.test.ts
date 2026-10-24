import { expect, test } from 'bun:test'
import { loadAnnotatedGoalCorpus } from '../scripts/lib/event-detect/goal-pipeline-goal-corpus'
import type { GoalPipelineResult } from '../scripts/lib/event-detect/goal-pipeline-schema'
import { scoreGoalStages } from '../scripts/lib/event-detect/goal-pipeline-stages'

const corpus = await loadAnnotatedGoalCorpus()
const sample = corpus.cases.find((row) => row.stageGold.items.length > 0)
if (sample === undefined) throw new Error('Missing annotated item fixture')
const request = {
  model: 'clef' as const,
  state: sample.post.text,
  questions: { is_event: { type: 'noul' as const, instructions: '関連性' } }
}
const response = { answers: { is_event: { type: 'noul' as const, noul: 0.6 } } }
const result: GoalPipelineResult = {
  version: 'fixture',
  extractionVersion: 'fixture',
  inputHash: 'fixture',
  post: sample.post,
  extraction: { events: sample.stageGold.items.map((item) => ({ ...item, stores: [], characterIds: [] })) },
  audit: {
    version: 'fixture',
    expected: 1,
    probability: 0.6,
    threshold: 0.9,
    extracted: 1,
    candidates: 1,
    status: 'low_confidence'
  },
  countRequest: request,
  countResponse: response,
  judgements: [],
  stopped: true,
  stopReasons: ['fixture'],
  calls: 2
}

test('stage observer retains exact source spans without scoring unknown semantics as quality', () => {
  const score = scoreGoalStages(sample, result)
  expect(score?.annotatedItems).toBe(sample.stageGold.items.length)
  expect(score?.extractedItems).toBe(sample.stageGold.items.length)
  expect(score?.judgedItems).toBe(0)
  expect(score?.semanticStageAccuracyScored).toBe(false)
  expect(score?.unannotatedFields).toEqual(sample.stageGold.unannotatedFields)
  expect(score?.actionAvailable).toBe(false)
})

test('legacy inputs with no stage annotation are unavailable rather than false stage negatives', () => {
  expect(scoreGoalStages({ post: sample.post }, result)).toBeNull()
})
