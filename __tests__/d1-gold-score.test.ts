import { expect, test } from 'bun:test'
import { viewOf } from '../scripts/lib/event-detect/d1-gold-candidate'
import { compareArgmax, compareRegistered, failedFields } from '../scripts/lib/event-detect/d1-gold-compare'
import { buildCaseRecord } from '../scripts/lib/event-detect/d1-gold-records'
import { checkReplayParity, pinTopChoice, replayDecision } from '../scripts/lib/event-detect/d1-gold-replay'
import { formatScore } from '../scripts/lib/event-detect/d1-gold-report'
import { quantile, rate, scoreRecords } from '../scripts/lib/event-detect/d1-gold-score'
import type { GoalPipelineResult } from '../scripts/lib/event-detect/goal-pipeline-schema'
import { goldCase, goldEvent } from './d1-gold-fixtures'
import { judgementWith, pick, realModule, realPost } from './d1-gold-judgement'

const gold = goldEvent({
  stores: ['yuurakuchou'],
  startDateJst: '2026-03-16',
  conditions: [{ type: 'first_come', quantity: 100 }]
})
const resultOf = (judgements: ReturnType<typeof judgementWith>[]): GoalPipelineResult => ({
  version: 'v',
  extractionVersion: 'e',
  inputHash: 'h',
  post: realPost,
  extraction: {
    events: judgements.map((j) => ({ item: j.item, stores: ['yuurakuchou'], characterIds: [], evidence: ['x'] }))
  },
  audit: {
    version: 'distribution-items-v2',
    expected: judgements.length,
    probability: 0.99,
    threshold: 0.9,
    extracted: judgements.length,
    candidates: judgements.length,
    status: 'matched'
  },
  countRequest: judgements[0].requests[0],
  countResponse: { answers: {} },
  judgements,
  stopped: false,
  stopReasons: [],
  calls: 3
})

test('quantile and rate handle empty and interpolated cases', () => {
  expect(quantile([], 0.5)).toBeNull()
  expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
  expect(quantile([0.2, 0.9], 1)).toBe(0.9)
  expect(rate(0, 0)).toEqual({ n: 0, d: 0, rate: null })
  expect(rate(1, 4).rate).toBe(0.25)
})

test('argmax comparison scores each field against the D1 gold event, and an explicit character only when present', () => {
  const view = viewOf(judgementWith({ store: ['yuurakuchou', 0.6], character: ['other', 0.5] }), 0)
  const fields = compareArgmax(view, gold)
  expect(fields).toMatchObject({ store: true, category: true, startDate: true, quantity: true, character: null })
  expect(compareArgmax(view, goldEvent({ ...gold, characterIds: ['yuurakuchou'] })).character).toBe(false)
  expect(compareArgmax(view, goldEvent({ ...gold, characterIds: ['other'] })).character).toBe(true)
  const wrong = compareArgmax(
    viewOf(
      judgementWith({
        store: ['honten', 0.9],
        character: ['honten', 0.9],
        category: 'regular_card',
        start: 'd20260316'
      }),
      0
    ),
    gold
  )
  expect(failedFields(wrong)).toContain('store')
  expect(failedFields(wrong)).toContain('category')
})

test('replay with unmodified answers reproduces the saved decision, status, reasons and candidate', () => {
  const module = realModule()
  const judgements = [
    judgementWith({ store: ['yuurakuchou', 0.95], character: ['yuurakuchou', 0.95] }),
    judgementWith({ store: ['yuurakuchou', 0.5], character: ['other', 0.4] }),
    judgementWith({ store: ['honten', 0.95], character: ['honten', 0.95] })
  ]
  expect(checkReplayParity(module, judgements)).toEqual({ checked: 3, mismatched: 0, ok: true })
  expect(judgements[0].decision.status).toBe('register')
  expect(judgements[1].decision.status).toBe('held')
  // 抽出段階の店舗と判定の店舗が食い違えば store_mismatch になる。ヒントを入力文から読み戻せている。
  expect(judgements[2].decision.reasons).toContain('store_mismatch')
  const tampered = { ...judgements[1], decision: { ...judgements[1].decision, reasons: ['other'] } }
  expect(checkReplayParity(module, [tampered]).ok).toBe(false)
})

test('top-one replay pins store and character to 1.0 and registers where the threshold held it back', () => {
  const module = realModule()
  const low = judgementWith({ store: ['yuurakuchou', 0.5], character: ['other', 0.4] })
  expect(replayDecision(module, low, 'saved').status).toBe('held')
  const pinned = replayDecision(module, low, 'top-one')
  expect(pinned.status).toBe('register')
  expect(pinned.candidate?.stores).toEqual(['yuurakuchou'])
  expect(pinned.candidate?.characterIds).toEqual(['other'])
  const answer = pinTopChoice(pick('a', 0.4, ['a', 'b', 'c']))
  expect(answer).toEqual({ type: 'choice', choice: 'a', probabilities: { a: 1, b: 0, c: 0 } })
  if (pinned.candidate === null) throw new Error('no candidate')
  expect(compareRegistered(pinned.candidate, gold)).toMatchObject({ store: true, startDate: true })
})

test('a top-one registration with a wrong store is counted as wrong, not hidden', () => {
  const module = realModule()
  const sample = goldCase(1, { events: [gold] })
  // 抽出段階も判定も同じ誤った店舗（honten）を指し、正解は有楽町。物品名で正解と対応づく。
  const wrong = judgementWith({ store: ['honten', 0.6], character: ['honten', 0.6] }, 'honten')
  const record = buildCaseRecord(module, sample, resultOf([wrong]))
  expect(record.candidates[0].current.status).toBe('held')
  expect(record.candidates[0].topOne.status).toBe('register')
  expect(record.candidates[0].matchedGold).toBe(gold.uuid)
  const score = scoreRecords([sample], [record], [])
  expect(score.topOne.registered).toMatchObject({ registered: 1, correct: 0, wrongMatched: 1, wrongUnmatched: 0 })
  expect(score.topOne.registered.wrongByField.store).toBe(1)
})

test('score aggregation separates captured, unmatched, incomplete posts and errors without dropping them', () => {
  const module = realModule()
  const good = goldCase(1, { events: [gold] })
  const missed = goldCase(2, {
    events: [goldEvent({ uuid: '22222222-2222-4222-8222-222222222222', title: '特製ノート', stores: ['honten'] })]
  })
  const failed = goldCase(3, { events: [gold] })
  const records = [
    buildCaseRecord(
      module,
      good,
      resultOf([judgementWith({ store: ['yuurakuchou', 0.95], character: ['yuurakuchou', 0.95] })])
    ),
    buildCaseRecord(
      module,
      missed,
      resultOf([
        judgementWith({ store: ['yuurakuchou', 0.95], character: ['yuurakuchou', 0.95] }, 'chiba', '名刺'),
        judgementWith({ store: ['yuurakuchou', 0.95], character: ['yuurakuchou', 0.95] }, 'chiba', 'アクスタ')
      ])
    ),
    buildCaseRecord(module, failed, null)
  ]
  const score = scoreRecords([good, missed, failed], records, [
    { caseId: failed.caseId, kinds: ['transport'], messages: ['HTTP 502'], calls: 1 }
  ])
  expect(score.sample).toMatchObject({ posts: 3, goldEvents: 3, completedPosts: 2, incompletePosts: 1 })
  expect(score.capture.allGoldEvents).toEqual({ n: 1, d: 3, rate: 1 / 3 })
  expect(score.capture.unmatchedCandidates).toBe(2)
  expect(score.errors.byKind).toEqual({ transport: 1 })
  expect(score.confidence.passingBoth).toHaveLength(5)
  expect(score.current.registeredCorrect.registered).toBeGreaterThanOrEqual(1)
  const text = formatScore(score, true)
  expect(text).toContain('## a.')
  expect(text).toContain('## f.')
  expect(formatScore(score, false)).toContain('この節の数値は出さない')
})

test('character statistics report same-as-store, special choices and explicit gold agreement', () => {
  const module = realModule()
  const explicit = goldEvent({ ...gold, characterIds: ['yuurakuchou'] })
  const sample = goldCase(1, { events: [explicit] })
  const result = resultOf([judgementWith({ store: ['yuurakuchou', 0.95], character: ['other', 0.6] })])
  const score = scoreRecords([sample], [buildCaseRecord(module, sample, result)], [])
  expect(score.character.explicitGoldEvents).toBe(1)
  expect(score.character.explicitGoldCharacterEqualsGoldStore).toEqual({ n: 1, d: 1, rate: 1 })
  expect(score.character.topMatchesExplicitGold).toEqual({ n: 0, d: 1, rate: 0 })
  expect(score.character.sameRealIdAsTopStore.n).toBe(0)
  expect(score.character.relationToTopStore).toEqual({ 'store-id-character-other': 1 })
  expect(score.character.topIsSpecial.other).toEqual({ n: 1, d: 1, rate: 1 })
})

test('a register is held by the production count-audit gate when the audit is not matched, and context-only candidates are listed', () => {
  const module = realModule()
  const sample = goldCase(1, { events: [gold] })
  const good = judgementWith({ store: ['yuurakuchou', 0.95], character: ['yuurakuchou', 0.95] })
  const matched = buildCaseRecord(module, sample, resultOf([good]))
  expect(matched.candidates[0].current.status).toBe('register')
  expect(matched.candidates[0].currentGated.status).toBe('register')
  const lowConfidence = { ...resultOf([good]), audit: { ...resultOf([good]).audit, status: 'low_confidence' as const } }
  const gated = buildCaseRecord(module, sample, lowConfidence)
  expect(gated.auditReasons).toEqual(['distribution_item_count_low_confidence'])
  expect(gated.candidates[0].current.status).toBe('register')
  expect(gated.candidates[0].currentGated).toMatchObject({
    status: 'held',
    reasons: ['distribution_item_count_low_confidence']
  })
  const context = { ...good, contextOnly: true }
  const score = scoreRecords(
    [sample],
    [gated, buildCaseRecord(module, goldCase(2, { events: [gold] }), resultOf([context]))],
    []
  )
  expect(score.current.registeredCorrect.registered).toBe(1)
  expect(score.current.afterAuditGate.registeredCorrect.registered).toBe(0)
  expect(score.current.afterAuditGate.allCandidates.heldReasons).toEqual({ distribution_item_count_low_confidence: 1 })
  expect(score.contextOnly.n).toBe(1)
  expect(score.contextOnly.current.byStatus).toEqual({ register: 1 })
})

test('capture is also reported without lone-candidate matches', () => {
  const module = realModule()
  const sample = goldCase(1, { events: [goldEvent({ title: '特製ノート', stores: ['honten'] })] })
  const lone = judgementWith({ store: ['yuurakuchou', 0.95], character: ['yuurakuchou', 0.95] }, 'chiba', '名刺')
  const score = scoreRecords([sample], [buildCaseRecord(module, sample, resultOf([lone]))], [])
  expect(score.capture.allGoldEvents).toEqual({ n: 1, d: 1, rate: 1 })
  expect(score.capture.allGoldEventsExcludingSoleCandidate).toEqual({ n: 0, d: 1, rate: 0 })
  expect(score.capture.byBasis).toEqual({ 'sole-candidate': 1 })
})

test('both-multiple is not counted as the same real ID as the store', () => {
  const module = realModule()
  const sample = goldCase(1, { events: [gold] })
  const same = judgementWith({ store: ['yuurakuchou', 0.9], character: ['yuurakuchou', 0.9] })
  const multi = judgementWith({ store: ['multiple', 0.6], character: ['multiple', 0.6] })
  const score = scoreRecords([sample], [buildCaseRecord(module, sample, resultOf([same, multi]))], [])
  expect(score.character.sameRealIdAsTopStore).toEqual({ n: 1, d: 2, rate: 0.5 })
  expect(score.character.sameRealIdGivenStoreIsId).toEqual({ n: 1, d: 1, rate: 1 })
  expect(score.character.relationToTopStore).toEqual({ 'both-multiple': 1, 'same-id': 1 })
})
