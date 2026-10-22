import { describe, expect, test } from 'bun:test'
import type { ClefAnswer, ClefRequest, ClefResponse } from './clef'
import { createDetectionRequests, evaluateDetection } from './detection'
import { extractedPost, extractionSystem, validateEventExtraction } from './extraction'
import type { DetectPost } from './post'

const createDetectionRequest = (
  post: DetectPost,
  model: 'clef' | 'clef-flash' = 'clef',
  storeKey: string | null = null
): ClefRequest => {
  const requests = createDetectionRequests(post, model, storeKey)
  return {
    model,
    state: requests[0].state,
    questions: Object.assign({}, ...requests.map((request) => request.questions))
  }
}
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
        stores: ['abeno'],
        characterIds: ['abeno'],
        evidence: [
          '10/16(金)から、3,000円以上ご購入で',
          'あべのたんアクリルキーホルダ― ハロウィンver.をプレゼントするで～',
          'おひとり様1個、無くなり次第終了'
        ]
      },
      {
        item: 'ハロウィン限定名刺',
        stores: ['abeno'],
        characterIds: ['abeno'],
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
    store: 'abeno',
    character: 'abeno'
  }
  const answers: Record<string, ClefAnswer> = Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      if (question.type === 'noul') return [id, { type: 'noul' as const, noul: id === 'is_event' ? 0.99 : 0.001 }]
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
  test('ギフトカードを配布物として保持し、名刺と混同せずその他で判定する', () => {
    const value = {
      ...post,
      text: 'あべのたんのギフトカードを10/16から先着100名にプレゼントします。限定名刺も配布します。'
    }
    const extraction = validateEventExtraction(value, {
      events: [
        {
          item: 'あべのたんギフトカード',
          stores: ['abeno'],
          characterIds: ['abeno'],
          evidence: ['あべのたんのギフトカードを10/16から先着100名にプレゼントします。']
        },
        { item: '限定名刺', stores: ['abeno'], characterIds: ['abeno'], evidence: ['限定名刺も配布します。'] }
      ]
    })
    expect(extraction.events).toHaveLength(2)
    expect(extraction.events[0].item).toBe('あべのたんギフトカード')
    const gift = extractedPost(value, extraction.events[0])
    expect(gift.text).not.toContain('名刺')
    const category = createDetectionRequest(gift).questions.category
    if (category.type !== 'choice') throw new Error('Expected choice')
    expect(Object.keys(category.criteria)).toEqual(['other', 'none'])
    expect(category.criteria.other).toContain('ギフトカード')
    expect(extractionSystem).toContain('ギフトカードも配布・プレゼント、ビッカメ娘の記念・限定デザインの販売・頒布')
    expect(extractionSystem).toContain('itemにはギフトカードであることを残して')
  })

  test('ギフトカードの非配布案内は抽出指示で区別し、空の抽出を受け付ける', () => {
    const value = { ...post, text: 'ギフトカードでお支払いいただけます' }
    expect(extractionSystem).toContain(
      '汎用ギフトカードの通常販売・購入・残高チャージ方法・支払い方法の案内だけなら列挙しません'
    )
    expect(validateEventExtraction(value, { events: [] }).events).toEqual([])
  })

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
  test('原文にない条件と店舗を拒否し、完全重複だけを除去する', () => {
    expect(() =>
      validateEventExtraction(post, {
        events: [{ item: '名刺', stores: [], characterIds: [], evidence: ['10/16から名刺を全員に配布'] }]
      })
    ).toThrow('unsupported evidence')
    expect(() =>
      validateEventExtraction(post, {
        events: [{ item: '名刺', stores: ['invented'], characterIds: ['abeno'], evidence: [post.text] }]
      })
    ).toThrow('unsupported store')
    const [event] = extracted().events
    expect(validateEventExtraction(post, { events: [event, event] }).events).toEqual([event])
    expect(extractionSystem).toContain('別の配布物にしか書かれていない')
  })
  test('引用の根拠を受け取り、別配布物を含む引用全文は検証に持ち込まない', () => {
    const quoted = { ...post, quoted: { id: '2109221721773576391', text: '限定名刺を本日から全員に配布します' } }
    const extraction = validateEventExtraction(quoted, {
      events: [{ item: '限定名刺', stores: [], characterIds: [], evidence: ['限定名刺を本日から全員に配布します'] }]
    })
    expect(extractedPost(quoted, extraction.events[0])).not.toHaveProperty('quoted')
    expect(extractedPost(quoted, extraction.events[0]).text).not.toContain('キーホルダ')
  })
})
