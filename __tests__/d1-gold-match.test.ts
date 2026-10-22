import { expect, test } from 'bun:test'
import { viewOf } from '../scripts/lib/event-detect/d1-gold-candidate'
import { matchCandidates, titleSimilarity } from '../scripts/lib/event-detect/d1-gold-match'
import { goldEvent } from './d1-gold-fixtures'
import { judgementWith } from './d1-gold-judgement'

const view = (index: number, item: string, storeKey: string | null, judged = 'yuurakuchou') =>
  viewOf(judgementWith({ store: [judged, 0.95], character: [judged, 0.95] }, storeKey, item), index)

test('title similarity ignores width, spacing and punctuation, and rewards containment', () => {
  expect(titleSimilarity('限定名刺', '限定 名刺')).toBe(1)
  expect(titleSimilarity('ＡＢＣ名刺', 'abc名刺')).toBe(1)
  expect(titleSimilarity('擬人化9周年記念アクキー', '9周年アクキー')).toBeGreaterThan(0.5)
  expect(titleSimilarity('限定名刺', '特製ノート')).toBeLessThan(0.3)
  expect(titleSimilarity('', '限定名刺')).toBe(0)
})

test('a candidate matches the gold event of its extraction-stage store, not the judged store', () => {
  const golds = [
    goldEvent({ uuid: 'a', title: '九州コラボ名刺', stores: ['tenjin'] }),
    goldEvent({ uuid: 'b', title: '九州コラボ名刺', stores: ['kumamoto'] })
  ]
  // 判定結果の店舗は両方とも間違っていても、抽出段階の店舗で一意に対応づく。
  const views = [view(0, '九州コラボ名刺', 'kumamoto', 'tenjin'), view(1, '九州コラボ名刺', 'tenjin', 'tenjin')]
  const result = matchCandidates(views, golds)
  expect(result.matches.map((m) => [m.candidate, m.gold])).toEqual(
    expect.arrayContaining([
      [0, 'b'],
      [1, 'a']
    ])
  )
  expect(result.matches).toHaveLength(2)
  expect(result.unmatchedGold).toEqual([])
  expect(result.matches.every((m) => m.basis === 'extraction-store+item')).toBe(true)
})

test('each gold event and candidate is used once; extras are counted as unmatched', () => {
  const golds = [goldEvent({ uuid: 'a', title: '限定名刺', stores: ['yuurakuchou'] })]
  const views = [view(0, '限定名刺', 'yuurakuchou'), view(1, '限定名刺', 'yuurakuchou')]
  const result = matchCandidates(views, golds)
  expect(result.matches).toHaveLength(1)
  expect(result.unmatchedCandidates).toHaveLength(1)
  expect(result.unmatchedGold).toEqual([])
})

test('the same inputs always give the same matches regardless of order', () => {
  const golds = [
    goldEvent({ uuid: 'b', title: '限定名刺', stores: ['yuurakuchou'] }),
    goldEvent({ uuid: 'a', title: '限定名刺', stores: ['yuurakuchou'] })
  ]
  const views = [view(0, '限定名刺', 'yuurakuchou'), view(1, '限定名刺', 'yuurakuchou')]
  const forward = matchCandidates(views, golds)
  const reversed = matchCandidates([...views].reverse(), [...golds].reverse())
  const key = (r: ReturnType<typeof matchCandidates>) => r.matches.map((m) => `${m.candidate}:${m.gold}`).sort()
  expect(key(forward)).toEqual(key(reversed))
})

test('a lone candidate and a lone gold event match even without a shared store or title', () => {
  const golds = [goldEvent({ uuid: 'a', title: '特製ノート', stores: ['honten'] })]
  const result = matchCandidates([view(0, '名刺', null)], golds)
  expect(result.matches).toHaveLength(1)
  expect(result.matches[0].basis).toBe('sole-candidate')
})

test('context-only candidates are never matched and the gold event stays uncaptured', () => {
  const golds = [goldEvent({ uuid: 'a', title: '限定名刺', stores: ['yuurakuchou'] })]
  const contextOnly = { ...view(0, '限定名刺', 'yuurakuchou'), contextOnly: true }
  const result = matchCandidates([contextOnly], golds)
  expect(result.matches).toHaveLength(0)
  expect(result.contextOnly).toEqual([0])
  expect(result.unmatchedGold).toEqual(['a'])
})

test('unrelated candidates and gold events produce no matches when several exist', () => {
  const golds = [
    goldEvent({ uuid: 'a', title: '特製ノート', stores: ['honten'] }),
    goldEvent({ uuid: 'b', title: '缶バッジ', stores: ['akiba'] })
  ]
  const result = matchCandidates([view(0, '名刺', 'chiba'), view(1, 'アクスタ', 'chiba')], golds)
  expect(result.matches).toHaveLength(0)
  expect(result.unmatchedGold).toHaveLength(2)
  expect(result.unmatchedCandidates).toHaveLength(2)
})
