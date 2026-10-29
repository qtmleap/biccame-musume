import { describe, expect, test } from 'bun:test'
import type { ClefAnswer, ClefResponse } from './clef'
import type { Category } from './detection-schemas'
import { linkedEventKinds } from './linked-event'

// 3段目で探すイベントの種類は、1段目の配布物（category）の最上位の選択肢だけで決める。確率の値（しきい値）は見ない。
// 配布物の質問にだけある選択肢 gift_card は、選択肢のキーの文字列で書く（その定義が無いブランチでも同じテストで動くように）。
const GIFT_CARD = 'gift_card'
const choice = (selected: string, probability: number, rest: Record<string, number> = {}): ClefAnswer => ({
  type: 'choice',
  choice: selected,
  probabilities: { [selected]: probability, ...rest }
})
const kindsOf = (category: ClefAnswer | undefined): readonly Category[] | null =>
  linkedEventKinds(category === undefined ? {} : { category })

describe('配布物の最上位 → 探すイベントの種類', () => {
  test.each<[string, Category[]]>([
    ['ackey', ['ackey']],
    ['acsta', ['acsta']],
    ['limited_card', ['limited_card', 'regular_card']],
    ['regular_card', ['limited_card', 'regular_card']],
    ['other', ['other']],
    // ギフトカードは other に対応づく（linked-event.ts の表で対応づける）。events.category には gift_card が無い。
    [GIFT_CARD, ['other']]
  ])('%s → %p', (selected, expected) => {
    expect(kindsOf(choice(selected, 0.9, { none: 0.05 }))).toEqual(expected)
  })

  test('none は、確率が高くても種類が決まらない（null）', () => {
    expect(kindsOf(choice('none', 0.99))).toBeNull()
    expect(kindsOf(choice('none', 0.3, { ackey: 0.29 }))).toBeNull()
  })

  test('他の項目の回答は見ない（category の回答だけで決める）', () => {
    const answers: ClefResponse['answers'] = {
      status: choice('end', 0.99),
      category: choice('ackey', 0.9),
      store: choice('akiba', 0.99)
    }
    expect(linkedEventKinds(answers)).toEqual(['ackey'])
    expect(linkedEventKinds({ status: choice('end', 0.99) })).toBeNull()
  })
})

describe('しきい値は課さない（最上位の選択肢だけで決める）', () => {
  test('category のしきい値（0.85）に届かない確率でも、最上位の種類で決まる', () => {
    expect(kindsOf(choice('ackey', 0.84))).toEqual(['ackey'])
    expect(kindsOf(choice('ackey', 0.3, { other: 0.25, none: 0.2 }))).toEqual(['ackey'])
    expect(kindsOf(choice('other', 0.5, { limited_card: 0.4 }))).toEqual(['other'])
    expect(kindsOf(choice('ackey', 0))).toEqual(['ackey'])
  })

  test('ギフトカードは確率が低くても other（gift_card と other の確率は合算せず、最上位の選択肢で決める）', () => {
    expect(kindsOf(choice(GIFT_CARD, 0.4, { other: 0.35 }))).toEqual(['other'])
    expect(kindsOf(choice('limited_card', 0.4, { [GIFT_CARD]: 0.35, other: 0.2 }))).toEqual([
      'limited_card',
      'regular_card'
    ])
  })

  test('最上位の確率が欠落していても、最上位の選択肢で決まる', () => {
    expect(kindsOf({ type: 'choice', choice: 'ackey', probabilities: {} })).toEqual(['ackey'])
    expect(kindsOf({ type: 'choice', choice: 'acsta', probabilities: { ackey: 0.95 } })).toEqual(['acsta'])
  })
})

describe('種類が決まらないとき（null。呼び出し側は聞かない）', () => {
  test('category の回答なし', () => {
    expect(kindsOf(undefined)).toBeNull()
  })

  test('choice でない回答（noul・score）', () => {
    expect(kindsOf({ type: 'noul', noul: 0.99 })).toBeNull()
    expect(kindsOf({ type: 'score', score: 1, confidence: 0.99 })).toBeNull()
  })

  test('未知の選択肢（確率が高くても）', () => {
    expect(kindsOf(choice('sticker', 0.99))).toBeNull()
    expect(kindsOf(choice('', 0.99))).toBeNull()
  })
})
