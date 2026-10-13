import { describe, expect, test } from 'bun:test'
import type { ClefAnswer, ClefRequest, ClefResponse } from './clef'
import { createDetectionRequest, evaluateDetection } from './detection'
import { extractedPost, extractionSystem, validateEventExtraction } from './extraction'
import type { DetectPost } from './post'

const post: DetectPost = {
  id: '2109221721773576390',
  screenName: 'bic_abeno',
  kind: 'original',
  createdAt: '2026-10-11T00:00:00Z',
  url: 'https://x.com/bic_abeno/status/2109221721773576390',
  media: [],
  text: 'ハロウィンイベント告知\n10/16(金)から、3,000円以上ご購入で\nあべのたんアクリルキーホルダ― ハロウィンver.をプレゼントするで～\nおひとり様1個、無くなり次第終了\nハロウィン限定名刺も用意してるからぜひお店に遊びに来てな～'
}
const extracted = () =>
  validateEventExtraction(post, {
    events: [
      {
        item: 'ハロウィンアクキー',
        store: 'abeno',
        evidence: [
          '10/16(金)から、3,000円以上ご購入で',
          'あべのたんアクリルキーホルダ― ハロウィンver.をプレゼントするで～',
          'おひとり様1個、無くなり次第終了'
        ]
      },
      {
        item: 'ハロウィン限定名刺',
        store: 'abeno',
        evidence: ['ハロウィン限定名刺も用意してるからぜひお店に遊びに来てな～']
      }
    ]
  })
const response = (request: ClefRequest): ClefResponse => {
  const desired: Record<string, string> = {
    status: 'announce',
    category: 'ackey',
    condition: 'purchase',
    purchase_amount: 'p3000',
    end_date: 'none',
    quantity: 'none',
    store: 'abeno'
  }
  const answers: Record<string, ClefAnswer> = Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      if (question.type === 'noul') return [id, { type: 'noul' as const, noul: 0.99 }]
      if (question.type === 'score') return [id, { type: 'score' as const, score: 1, confidence: 0.99 }]
      const keys = Object.keys(question.criteria)
      const preferred = desired[id]
      const choice = preferred !== undefined && keys.includes(preferred) ? preferred : keys[0]
      return [
        id,
        {
          type: 'choice' as const,
          choice,
          probabilities: Object.fromEntries(keys.map((key) => [key, key === choice ? 0.99 : 0]))
        }
      ]
    })
  )
  return { answers }
}

describe('配布物ごとの抽出', () => {
  test('名刺へアクキーの日付・購入条件を流用しない', () => {
    const events = extracted().events
    expect(events).toHaveLength(2)
    const key = extractedPost(post, events[0])
    const card = extractedPost(post, events[1])
    expect(key.text).toContain('3,000円')
    expect(card.text).not.toContain('3,000円')
    expect(card.text).not.toContain('10/16')
    const request = createDetectionRequest(key, 'clef', 'abeno')
    expect(request.questions.single_event).toBeUndefined()
    const decision = evaluateDetection(key, request, response(request), undefined, 'abeno')
    expect(decision.status).toBe('register')
    if (decision.status !== 'register') throw new Error('Expected registration')
    expect(decision.candidate.category).toBe('ackey')
    expect(decision.candidate.startDate).toBe('2026-10-16')
    expect(decision.candidate.conditions).toEqual([{ type: 'purchase', purchaseAmount: 3000 }])
  })
  test('アクリルだけではアクキーに分類しない', () => {
    const request = createDetectionRequest({ ...post, text: '本日からアクリルコースターをどなたでも配布します' })
    const category = request.questions.category
    if (category.type !== 'choice') throw new Error('Expected choice')
    expect(category.criteria.ackey).toBeUndefined()
    expect(category.criteria.acsta).toBeUndefined()
  })
  test('原文にない条件と店舗、重複候補を拒否する', () => {
    expect(() =>
      validateEventExtraction(post, { events: [{ item: '名刺', evidence: ['10/16から名刺を全員に配布'] }] })
    ).toThrow('unsupported evidence')
    expect(() =>
      validateEventExtraction(post, { events: [{ item: '名刺', store: 'akiba', evidence: [post.text] }] })
    ).toThrow('unsupported store')
    const [event] = extracted().events
    expect(() => validateEventExtraction(post, { events: [event, event] })).toThrow('Duplicate')
    expect(extractionSystem).toContain('別の配布物にしか書かれていない')
  })
  test('引用の根拠を受け取り、別配布物を含む引用全文は検証に持ち込まない', () => {
    const quoted = { ...post, quoted: { id: '2109221721773576391', text: '限定名刺を本日から全員に配布します' } }
    const extraction = validateEventExtraction(quoted, {
      events: [{ item: '限定名刺', evidence: ['限定名刺を本日から全員に配布します'] }]
    })
    expect(extractedPost(quoted, extraction.events[0]).quoted).toBeUndefined()
    expect(extractedPost(quoted, extraction.events[0]).text).not.toContain('キーホルダ')
  })
})
