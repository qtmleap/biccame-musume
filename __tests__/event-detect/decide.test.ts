import { describe, expect, test } from 'bun:test'
import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import {
  buildState,
  dateCandidates,
  endedEventQuestion,
  keyToDate,
  keyToQuantity,
  quantityCandidates,
  storeCandidates,
  valueQuestions
} from '../../scripts/lib/event-detect/decide'
import type { GoldEvent } from '../../scripts/lib/event-detect/gold'

const accounts = [
  { storeId: 'example', name: '例たん', screenName: 'Bic_Example' },
  { storeId: 'other', name: '他たん', screenName: 'bic_other' }
]

const post = (text: string, overrides: Partial<DetectPost> = {}): DetectPost => ({
  id: '1',
  // JST 2026-06-01（月）10:00
  createdAt: '2026-06-01T01:00:00.000Z',
  screenName: 'bic_example',
  kind: 'original',
  text,
  url: 'https://x.com/bic_example/status/1',
  media: [],
  ...overrides
})

const event = (overrides: Partial<GoldEvent> = {}): GoldEvent => ({
  uuid: '00000000-0000-4000-8000-000000000001',
  title: '夏名刺',
  category: 'limited_card',
  stores: ['example'],
  startDate: '2026-05-31T15:00:00.000Z',
  endDate: '2026-06-29T15:00:00.000Z',
  conditions: [{ type: 'everyone' }],
  isPreliminary: false,
  referenceUrls: [],
  ...overrides
})

describe('dateCandidates', () => {
  test('M/D と M月D日 を投稿日に近い年で読む', () => {
    expect(dateCandidates(post('6/8(月)から配布、7月6日まで'))).toEqual(['2026-06-08', '2026-07-06'])
  })

  test('年をまたぐ日付は近い方の年にする', () => {
    expect(dateCandidates(post('1/2から新年名刺', { createdAt: '2026-12-20T01:00:00.000Z' }))).toEqual(['2027-01-02'])
  })

  test('全角スラッシュの直後の日付も拾う', () => {
    expect(dateCandidates(post('／\n11/3(火)限定✨'))).toEqual(['2026-11-03'])
  })

  test('本日・明日は投稿日から日付にする', () => {
    expect(dateCandidates(post('本日から配布、明日まで'))).toEqual(['2026-06-01', '2026-06-02'])
  })

  test('年付きの日付は月日だけを取る', () => {
    expect(dateCandidates(post('2026/10/25から'))).toEqual(['2026-10-25'])
  })
})

describe('quantityCandidates', () => {
  test('個・枚・名などの数を重複なく昇順で返す', () => {
    expect(quantityCandidates(post('先着１００名様、各5,000個、100枚'))).toEqual([100, 5000])
  })
})

describe('questions', () => {
  test('state に投稿日・投稿者の店舗・引用元を入れる', () => {
    const state = buildState(
      post('配布します', { quoted: { id: '2', screenName: 'bic_other', text: '告知' } }),
      accounts
    )
    expect(state).toContain('投稿日: 2026-06-01（月）')
    expect(state).toContain('例たん（example）')
    expect(state).toContain('引用元 @bic_other:\n告知')
  })

  test('本文に出てくるキャラ名の店舗も候補に入れる', () => {
    const names = new Map([
      ['example', ['例たん']],
      ['other', ['他たん', '他店']]
    ])
    expect(storeCandidates(post('他たんとコラボ'), accounts, names)).toEqual(['example', 'other'])
  })

  test('候補が無い値の質問は作らず、候補があれば none を足す', () => {
    const labels = new Map([['example', '例たん']])
    const { questions } = valueQuestions(post('6/8から先着100個'), ['example'], labels)
    expect(Object.keys(questions)).toEqual(['store', 'start_date', 'end_date', 'quantity'])
    expect(questions.quantity).toEqual({
      type: 'choice',
      instructions: '配布数（先着・限定の個数）はどれですか？',
      criteria: { q100: '100', none: '本文に書かれていない' }
    })
    expect(Object.keys(valueQuestions(post('名刺かわいい'), [], labels).questions)).toEqual([])
  })

  test('選択肢のキーから値に戻せる', () => {
    expect(keyToDate('d20260608')).toBe('2026-06-08')
    expect(keyToDate('none')).toBeUndefined()
    expect(keyToQuantity('q100')).toBe(100)
  })

  test('終了の候補は同じ店舗で開始済み・期間内のイベントだけ', () => {
    const other = event({ uuid: '00000000-0000-4000-8000-000000000002', stores: ['other'] })
    const future = event({ uuid: '00000000-0000-4000-8000-000000000003', startDate: '2026-07-31T15:00:00.000Z' })
    const { question, candidates } = endedEventQuestion(post('配布終了しました'), ['example'], [event(), other, future])
    expect(candidates.map((candidate) => candidate.uuid)).toEqual([event().uuid])
    expect(question?.type === 'choice' ? Object.keys(question.criteria) : []).toEqual(['e0', 'none'])
  })

  test('組み立てたリクエストは Clef の入力スキーマを満たす', () => {
    const labels = new Map([['example', '例たん']])
    const { questions } = valueQuestions(post('6/8から先着100個'), ['example'], labels)
    const parsed = ClefRequestSchema.safeParse({
      model: 'clef-flash',
      state: buildState(post('x'), accounts),
      questions
    })
    expect(parsed.success).toBe(true)
  })
})

describe('ClefResponseSchema', () => {
  test('noul と choice の応答を読める', () => {
    const parsed = ClefResponseSchema.safeParse({
      answers: {
        is_event: { type: 'noul', noul: 0.96 },
        status: {
          type: 'choice',
          choice: 'announce',
          probabilities: { announce: 0.88, none: 0.12 },
          confidence: 0.73
        }
      },
      usage: { input_tokens: 434, output_tokens: 0 }
    })
    expect(parsed.success).toBe(true)
  })

  test('確率が範囲外なら弾く', () => {
    expect(ClefResponseSchema.safeParse({ answers: { x: { type: 'noul', noul: 1.5 } } }).success).toBe(false)
  })
})
