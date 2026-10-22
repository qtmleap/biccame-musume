import { expect, test } from 'bun:test'
import {
  auditItemCount,
  type EventExtraction,
  extractionCandidateInputs,
  extractionInputStoreKey,
  matchExtractionCandidateInput,
  validateEventExtraction
} from '@biccame/shared/event-detect/extraction'
import type { DetectPost } from '@biccame/shared/event-detect/post'

const STORES = ['nanba', 'abeno', 'yao', 'takatsuki']
const text =
  'なんば・あべの・八尾・高槻で合同限定名刺を配布します。\n秋葉原でステッカーも配布します。\n名前の無い名刺も配ります。'
const post: DetectPost = {
  id: '2112378276735750720',
  screenName: 'bic_nanba',
  text,
  createdAt: '2026-10-11T00:00:00Z',
  kind: 'original',
  url: 'https://x.com/bic_nanba/status/2112378276735750720',
  media: []
}
const joint = 'なんば・あべの・八尾・高槻で合同限定名刺を配布します。'
const sticker = '秋葉原でステッカーも配布します。'
const unnamed = '名前の無い名刺も配ります。'
const extraction = (): EventExtraction =>
  validateEventExtraction(post, {
    events: [
      { item: '合同限定名刺', stores: STORES, characterIds: ['akiba', 'abeno'], evidence: [joint] },
      { item: 'ステッカー', stores: ['akiba'], characterIds: ['akiba'], evidence: [sticker] },
      { item: '名刺', stores: [], characterIds: [], evidence: [unnamed] }
    ]
  })

test('複数店舗の抽出イベントは店舗ごとの候補へ展開し、item と原文根拠は同じにする', () => {
  const inputs = extractionCandidateInputs(post, extraction())
  expect(inputs).toHaveLength(6)
  const split = inputs.slice(0, 4)
  expect(split.map((input) => input.stores)).toEqual(STORES.map((store) => [store]))
  expect(split.map((input) => extractionInputStoreKey(input))).toEqual(STORES)
  expect(split.map((input) => input.item)).toEqual(Array(4).fill('合同限定名刺'))
  expect(split.map((input) => input.post.text)).toEqual(Array(4).fill(joint))
  // 対象の娘は分けず、各候補が全員を持つ（娘ごとの分割はしない。複数なら判定が multiple で保留にする）。
  expect(split.map((input) => input.characterIds)).toEqual(Array(4).fill(['akiba', 'abeno']))
  expect(new Set(split.map((input) => input.characterIds)).size).toBe(4)
})

test('店舗が 1 件・0 件の抽出イベントは従来どおり 1 候補で、store_key は 1 件のときだけ付く', () => {
  const inputs = extractionCandidateInputs(post, extraction())
  expect(inputs.slice(4).map((input) => [input.item, input.stores])).toEqual([
    ['ステッカー', ['akiba']],
    ['名刺', []]
  ])
  expect(inputs.slice(4).map((input) => extractionInputStoreKey(input))).toEqual(['akiba', null])
  // 配布物ゼロの文脈候補も従来どおり（店舗なし）。
  const context = extractionCandidateInputs(post, { events: [] })
  expect(context).toHaveLength(1)
  expect(extractionInputStoreKey(context[0])).toBeNull()
})

test('分割は入力の抽出を変えず、候補の入力どうしで配列を共有しない', () => {
  const value = extraction()
  const before = JSON.stringify(value)
  const inputs = extractionCandidateInputs(post, value)
  inputs[0].stores.push('kashiwa')
  inputs[0].characterIds.push('funato')
  expect(JSON.stringify(value)).toBe(before)
  expect(inputs[1].stores).toEqual(['abeno'])
  expect(inputs[1].characterIds).toEqual(['akiba', 'abeno'])
})

test('分割しても件数監査の数は抽出イベントの数で、候補数と混同しない', () => {
  const value = extraction()
  const response = {
    answers: { distribution_item_count: { type: 'choice' as const, choice: '3', probabilities: { '3': 0.99 } } }
  }
  const audit = auditItemCount(value.events, response, 0.9)
  expect(extractionCandidateInputs(post, value)).toHaveLength(6)
  expect(audit).toMatchObject({ expected: 3, extracted: 3, candidates: 3, status: 'matched' })
})

test('展開後の候補数は抽出の上限（20 件）を超えうるが、分割は保存後の候補作成時なので抽出自体は 20 件のまま', () => {
  const stores = Array.from({ length: 20 }, (_, index) => `s${index}`)
  const many = {
    events: Array.from({ length: 20 }, () => ({ item: '全店配布', stores, characterIds: [], evidence: [joint] }))
  }
  // 店舗の実在検証（validateEventExtraction）は通さず、分割の関数だけを直接確かめる（20 イベント x 20 店舗 = 400 候補）。
  const inputs = extractionCandidateInputs(post, many)
  expect(inputs).toHaveLength(400)
  expect(many.events).toHaveLength(20)
})

test('保存済みの候補の (item, storeKey) から対応する入力を一意に探す', () => {
  const value = extraction()
  const abeno = matchExtractionCandidateInput(post, value, '合同限定名刺', 'abeno')
  expect(abeno?.stores).toEqual(['abeno'])
  expect(abeno?.post.text).toBe(joint)
  // 店舗 0 件の抽出イベントの候補（store_key が null）は item で探す。
  expect(matchExtractionCandidateInput(post, value, '名刺', null)?.post.text).toBe(unnamed)
  // 分割前に複数店舗を 1 行へ保存した旧候補（store_key が null）は item だけで探し、先頭の入力を返す。
  expect(matchExtractionCandidateInput(post, value, '合同限定名刺', null)?.post.text).toBe(joint)
  // 抽出に無い item・店舗の候補は復元しない。
  expect(matchExtractionCandidateInput(post, value, '存在しない配布物', 'abeno')).toBeUndefined()
})

test('同じ item でも店舗が別の抽出イベントは店舗で区別し、同じ item と店舗が複数なら復元しない', () => {
  const first = 'あきばで1,000円以上購入の限定名刺を配布します。'
  const second = 'あべので3,000円以上購入の限定名刺を配布します。'
  const original = { ...post, text: `${first}\n${second}` }
  const same = validateEventExtraction(original, {
    events: [
      { item: '限定名刺', stores: ['akiba'], characterIds: ['akiba'], evidence: [first] },
      { item: '限定名刺', stores: ['abeno'], characterIds: ['abeno'], evidence: [second] }
    ]
  })
  expect(matchExtractionCandidateInput(original, same, '限定名刺', 'akiba')?.post.text).toBe(first)
  expect(matchExtractionCandidateInput(original, same, '限定名刺', 'abeno')?.post.text).toBe(second)
  // store_key が無い旧候補は item だけでは決められない。
  expect(matchExtractionCandidateInput(original, same, '限定名刺', null)).toBeUndefined()
  const duplicated = validateEventExtraction(original, {
    events: [
      { item: '限定名刺', stores: ['akiba'], characterIds: [], evidence: [first] },
      { item: '限定名刺', stores: ['akiba'], characterIds: [], evidence: [second] }
    ]
  })
  expect(matchExtractionCandidateInput(original, duplicated, '限定名刺', 'akiba')).toBeUndefined()
})
