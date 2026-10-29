import { describe, expect, test } from 'bun:test'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { createDetectionRequests } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { webhookPromptDefinition } from '@biccame/shared/event-detect/prompt-definitions'
import { restoreCategoryQuestion, restoreV15Request } from './d1-gold-v15-restore'

// d1-gold-regression.test.ts が、現行の request を v15 に戻して sha256 を比べるときの戻し方そのものの検査。
// category の質問文は v15 から変わっていないので触らない。gift_card が出る候補は選択肢から外れて other の説明が v15 のものに戻り、
// 出ない候補は category を一切変えない。娘の質問はどちらも v15 になる。
const v15 = webhookPromptDefinition('v5-webhook-v15-concise-author')
if (v15 === undefined) throw new Error('Missing v15 prompt definition')
const v15Question = (key: string) => {
  const question = v15.questions.find((entry) => entry.key === key)
  if (question === undefined) throw new Error(`Missing v15 ${key} question`)
  return question
}

const postOf = (item: string, text: string): DetectPost => ({
  id: '2109221721773576390',
  createdAt: '2026-10-11T01:00:00.000Z',
  screenName: 'bic_abeno',
  kind: 'original',
  text,
  url: 'https://x.com/bic_abeno/status/2109221721773576390',
  media: [],
  extractionContext: { kind: 'item', item, evidence: [text], originalText: text }
})
const firstRequest = (post: DetectPost): ClefRequest => createDetectionRequests(post)[0]
const categoryOf = (request: ClefRequest) => {
  const question = request.questions.category
  if (question?.type !== 'choice') throw new Error('Missing category question')
  return question
}

const gift = firstRequest(postOf('4店舗特典ギフトカード', '名刺とギフトカードを配布します'))
const plain = firstRequest(postOf('限定名刺', '限定名刺を配布します'))

describe('現行の request を v15 の質問に戻す', () => {
  test('前提: gift_card が出る候補と出ない候補で、現行の category の選択肢が違う', () => {
    expect(Object.keys(categoryOf(gift).criteria)).toEqual([
      'limited_card',
      'regular_card',
      'gift_card',
      'other',
      'none'
    ])
    expect(Object.keys(categoryOf(plain).criteria)).toEqual(['limited_card', 'regular_card', 'other', 'none'])
    expect(categoryOf(gift).criteria.other).not.toBe(v15Question('category').criteria.other)
    expect(categoryOf(plain).criteria.other).toBe(v15Question('category').criteria.other)
  })

  test('質問文は gift_card の有無に関わらず v15 と同一（戻す必要がない）', () => {
    expect(categoryOf(gift).instructions).toBe(v15Question('category').instructions)
    expect(categoryOf(plain).instructions).toBe(v15Question('category').instructions)
  })

  test('gift_card が出る候補: gift_card を外し、other の説明を v15 に戻す（質問文と他の選択肢はそのまま）', () => {
    const restored = restoreCategoryQuestion(categoryOf(gift), v15)
    expect(restored.instructions).toBe(categoryOf(gift).instructions)
    expect(restored.instructions).toBe(v15Question('category').instructions)
    expect(Object.keys(restored.criteria)).toEqual(['limited_card', 'regular_card', 'other', 'none'])
    expect(restored.criteria.other).toBe(v15Question('category').criteria.other)
    expect(restored.criteria.limited_card).toBe(categoryOf(gift).criteria.limited_card)
    expect(restored.criteria.none).toBe(categoryOf(gift).criteria.none)
  })

  test('gift_card が出ない候補: category を何も変えない（質問文も選択肢も説明も、現行のまま v15 と同一）', () => {
    const restored = restoreCategoryQuestion(categoryOf(plain), v15)
    expect(restored).toEqual(categoryOf(plain))
    expect(restored.instructions).toBe(v15Question('category').instructions)
  })

  test('出る候補と出ない候補は、同じ根拠語の選択肢なら、戻すと完全に一致する', () => {
    const giftOnly = firstRequest(postOf('ギフトカード', '本日からギフトカードを配布します'))
    const none = firstRequest(postOf('缶バッジ', '本日から缶バッジを配布します'))
    expect(restoreCategoryQuestion(categoryOf(giftOnly), v15)).toEqual(restoreCategoryQuestion(categoryOf(none), v15))
  })

  test('request 全体: 娘と配布物の質問が v15 になり、state・モデル・他の質問は現行のまま', () => {
    for (const request of [gift, plain]) {
      const restored = restoreV15Request(request, v15)
      expect(restored.model).toBe(request.model)
      expect(restored.state).toBe(request.state)
      const character = v15Question('character')
      expect(restored.questions.character).toEqual({
        type: 'choice',
        instructions: character.instructions,
        criteria: character.criteria
      })
      expect(restored.questions.category).toEqual(restoreCategoryQuestion(categoryOf(request), v15))
      const changed = ['character', 'category']
      expect(Object.keys(restored.questions)).toEqual(Object.keys(request.questions))
      for (const key of Object.keys(request.questions).filter((entry) => !changed.includes(entry)))
        expect(restored.questions[key]).toEqual(request.questions[key])
    }
  })

  test('入力の request は書き換えない', () => {
    const before = JSON.stringify(gift)
    restoreV15Request(gift, v15)
    expect(JSON.stringify(gift)).toBe(before)
  })

  test('category の質問が無い request は例外にする（黙って通さない）', () => {
    const { category: _category, ...rest } = gift.questions
    expect(() => restoreV15Request({ ...gift, questions: rest }, v15)).toThrow('Missing category question')
  })
})
