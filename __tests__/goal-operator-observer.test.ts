import { expect, test } from 'bun:test'
import type { BenchmarkCase } from '../scripts/lib/event-detect/benchmark-schema'
import { type GoalProofReader, observeGoalOperator } from '../scripts/lib/event-detect/goal-pipeline-operator'
import type { GoalPipelineResult } from '../scripts/lib/event-detect/goal-pipeline-schema'
import { scoreGoalPipeline } from '../scripts/lib/event-detect/goal-pipeline-score'

const post = {
  id: '1000000000000000000',
  screenName: 'bic_yuurakuchou',
  kind: 'original' as const,
  createdAt: '2026-10-20T00:00:00Z',
  url: 'https://x.com/bic_yuurakuchou/status/1000000000000000000',
  text: '有楽町たん名刺を配布します。',
  media: []
}
const request = {
  model: 'clef' as const,
  state: post.text,
  questions: { is_event: { type: 'noul' as const, instructions: '関連企画か' } }
}
const response = { answers: { is_event: { type: 'noul' as const, noul: 0.6 } } }
const makeResult = (): GoalPipelineResult => ({
  version: 'baseline-v8',
  extractionVersion: 'old',
  inputHash: 'fixture',
  post,
  extraction: {
    events: [{ item: '名刺', stores: ['yuurakuchou'], characterIds: ['yuurakuchou'], evidence: [post.text] }]
  },
  audit: {
    version: 'fixture',
    expected: 1,
    probability: 0.99,
    threshold: 0.9,
    extracted: 1,
    candidates: 1,
    status: 'matched'
  },
  countRequest: request,
  countResponse: response,
  stopped: false,
  stopReasons: [],
  calls: 4,
  judgements: [
    {
      item: '名刺',
      post,
      requests: [request],
      response,
      decision: {
        status: 'held',
        confidence: 0.6,
        reasons: ['event_confidence_below_threshold', 'distribution_condition_unconfirmed']
      },
      draft: {
        title: '名刺',
        category: 'limited_card',
        stores: ['yuurakuchou'],
        characterIds: ['yuurakuchou'],
        conditions: []
      },
      outcome: null,
      groundedEvidence: [],
      contextOnly: false
    }
  ]
})
const readProof: GoalProofReader = (input) => [
  {
    code: 'named_character_object',
    strength: 'explicit',
    sourceText: input.text,
    start: 0,
    end: input.text.length,
    quote: input.text,
    relation: '有楽町たん名刺',
    operation: '配布'
  }
]
const sample: BenchmarkCase = {
  id: 'operator-fixture',
  source: 'synthetic',
  description: '共通観測器の対照',
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
  rationale: '本文に物品と配布が明示される',
  tags: [],
  group: 'operator-fixture',
  reviewStatus: 'provisional'
}

test('legacy held below .9 with visible supported draft counts identically to new discovery flags', () => {
  const legacy = makeResult()
  const modern: GoalPipelineResult = {
    ...legacy,
    version: 'new-policy',
    judgements: legacy.judgements.map((item) => ({
      ...item,
      outcome: {
        discovery: { status: 'detected', confidence: 0.6, evidence: ['named_character_object'] },
        action: 'review',
        missingFields: ['conditions']
      },
      groundedEvidence: ['named_character_object']
    }))
  }
  const oldObserved = observeGoalOperator(legacy, readProof)
  const newObserved = observeGoalOperator(modern, readProof)
  expect(oldObserved.detected).toBe(true)
  expect(newObserved).toEqual(oldObserved)
  const before = scoreGoalPipeline(sample, legacy, readProof)
  const after = scoreGoalPipeline(sample, modern, readProof)
  expect(before.truePositive).toBe(false)
  expect(after.truePositive).toBe(true)
  expect(before.layers.operatorVisible).toBe(true)
  expect(after.layers.operatorVisible).toBe(true)
  expect(before.productionDetected).toBe(false)
  expect(after.productionDetected).toBe(true)
})

test('operator-visible information is independent of raw relevance confidence including ignored candidates', () => {
  for (const probability of [0.01, 0.49, 0.99]) {
    const fixture = makeResult()
    const result: GoalPipelineResult = {
      ...fixture,
      judgements: fixture.judgements.map((item) => ({
        ...item,
        decision: { ...item.decision, status: 'ignored' },
        response: { answers: { is_event: { type: 'noul', noul: probability } } }
      }))
    }
    const observed = observeGoalOperator(result, () => [])
    expect(observed.visibleCandidate).toBe(true)
    expect(observed.candidates[0].probability).toBe(probability)
    expect(observed.candidates[0].relationConfirmed).toBe(probability >= 0.9)
  }
})

test('same-name candidates use their own exact focused evidence in both legacy and context inputs', () => {
  const first = '有楽町たん名刺を10月21日に配布。'
  const second = 'あべのたん名刺を10月22日に配布。'
  const original = `${first}\n${second}`
  for (const modern of [false, true]) {
    const fixture = makeResult()
    const evidence = [first, second]
    const seen: string[] = []
    const result: GoalPipelineResult = {
      ...fixture,
      post: { ...fixture.post, text: original },
      extraction: {
        events: evidence.map((text, index) => ({
          item: '名刺',
          stores: [index === 0 ? 'yuurakuchou' : 'abeno'],
          characterIds: [],
          evidence: [text]
        }))
      },
      judgements: evidence.map((text) => ({
        ...fixture.judgements[0],
        post: {
          ...fixture.post,
          text,
          ...(modern
            ? { extractionContext: { kind: 'item' as const, item: '名刺', evidence: [text], originalText: original } }
            : {})
        }
      }))
    }
    const observed = observeGoalOperator(result, (input) => {
      seen.push(input.text)
      return []
    })
    expect(seen).toEqual(evidence)
    expect(observed.candidates.map((item) => item.visibleCandidate)).toEqual([true, true])
    expect(observed.candidates.map((item) => item.relationConfirmed)).toEqual([false, false])
  }
})

test('gold, D1 and new flags do not change visible candidates or invent confirmed relations', () => {
  const legacy = makeResult()
  const modern: GoalPipelineResult = {
    ...legacy,
    judgements: legacy.judgements.map((item) => ({
      ...item,
      outcome: {
        discovery: { status: 'detected', confidence: 1, evidence: ['invented'] },
        action: 'review',
        missingFields: []
      }
    }))
  }
  const noProof: GoalProofReader = () => []
  const before = observeGoalOperator(legacy, noProof)
  const after = observeGoalOperator(modern, noProof)
  expect(before.detected).toBe(true)
  expect(after).toEqual(before)
  expect(before.candidates[0].relationConfirmed).toBe(false)
})

test('legacy ignored Urawa item remains operator-visible below .9 with link available', () => {
  const legacy = makeResult()
  const source = { ...post, screenName: 'bic_urawa', text: 'こちらの名刺も配布開始いたしますワ！' }
  const urawa: GoalPipelineResult = {
    ...legacy,
    post: source,
    extraction: { events: [{ item: '名刺', stores: ['urawa'], characterIds: [], evidence: [source.text] }] },
    judgements: legacy.judgements.map((item) => ({
      ...item,
      post: source,
      response: { answers: { is_event: { type: 'noul', noul: 0.8999 } } },
      decision: { status: 'ignored', confidence: 0, reasons: ['non_store_account'] },
      draft: {},
      outcome: null,
      groundedEvidence: []
    }))
  }
  const modern: GoalPipelineResult = {
    ...urawa,
    version: 'new-policy',
    judgements: urawa.judgements.map((item) => ({
      ...item,
      outcome: {
        discovery: { status: 'detected', confidence: 0.8999, evidence: ['official_card_distribution'] },
        action: 'review',
        missingFields: []
      }
    }))
  }
  const noProof: GoalProofReader = () => []
  const before = observeGoalOperator(urawa, noProof)
  expect(before.detected).toBe(true)
  expect(before.candidates[0].concreteDraft).toBe(false)
  expect(before.candidates[0].visibleSavedItem).toBe(true)
  expect(observeGoalOperator(modern, noProof)).toEqual(before)
})

test('ignored uses displayed saved item and link action, never an invisible computed draft', () => {
  const legacy = makeResult()
  const invalidProof: GoalProofReader = () => [
    {
      code: 'named_character_object',
      strength: 'explicit',
      sourceText: 'not in original',
      start: 0,
      end: 19,
      quote: 'not in original',
      relation: '名刺',
      operation: '配布'
    }
  ]
  const visible = observeGoalOperator(legacy, invalidProof)
  expect(visible.detected).toBe(true)
  expect(visible.candidates[0].relationConfirmed).toBe(false)
  const ignored: GoalPipelineResult = {
    ...legacy,
    judgements: legacy.judgements.map((item) => ({ ...item, decision: { ...item.decision, status: 'ignored' } }))
  }
  const ignoredObserved = observeGoalOperator(ignored, readProof)
  expect(ignoredObserved.detected).toBe(true)
  expect(ignoredObserved.candidates[0].concreteDraft).toBe(false)
  expect(ignoredObserved.candidates[0].visibleSavedItem).toBe(true)
  expect(ignoredObserved.candidates[0].inspectableAction).toBe(true)
  const hidden: GoalPipelineResult = {
    ...ignored,
    extraction: { events: [] },
    judgements: ignored.judgements.map((item) => ({ ...item, contextOnly: true }))
  }
  expect(observeGoalOperator(hidden, readProof).detected).toBe(false)
})
