import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describeAnswers, reasonLabel } from './answer-view'
import type { ClefAnswer, ClefRequest } from './clef'
import { createDetectionRequest, evaluateDetection } from './detection'
import { DROP_REASONS } from './filter'
import type { DetectPost } from './post'

const thresholds = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 }
const choice = (selected: string, probabilities: Record<string, number>): ClefAnswer => ({
  type: 'choice',
  choice: selected,
  probabilities
})
// 新東たんの実回答に近い値。キーの並びはわざと乱してあり、行の順は describeAnswers が決める。
const shintouAnswers: Record<string, ClefAnswer> = {
  condition: choice('purchase', { purchase: 0.9813, none: 0.01, first_come: 0.005 }),
  single_event: { type: 'noul', noul: 0.9149 },
  quantity: choice('q60', { q60: 0.9809, none: 0.01 }),
  end_date: choice('none', { none: 0.541, d20261025: 0.4 }),
  store: choice('none', { none: 0.6084, shintou: 0.3916 }),
  category: choice('acsta', { acsta: 0.4544, ackey: 0.4279, other: 0.09, none: 0.02 }),
  start_date: choice('d20261019', { d20261019: 0.9943, none: 0.004 }),
  status: choice('announce', { announce: 0.7499, start: 0.15, none: 0.05, ongoing: 0.03 }),
  is_event: { type: 'noul', noul: 0.7224 }
}

describe('describeAnswers', () => {
  const rows = describeAnswers(shintouAnswers, thresholds)
  const rowOf = (key: string) => {
    const row = rows.find((entry) => entry.key === key)
    if (row === undefined) throw new Error(`Missing row ${key}`)
    return row
  }

  test('行は固定の順に並ぶ（回答の保存順に依存しない）', () => {
    expect(rows.map((row) => row.key)).toEqual([
      'is_event',
      'status',
      'category',
      'single_event',
      'store',
      'start_date',
      'end_date',
      'quantity',
      'condition'
    ])
    expect(rows.map((row) => row.label)).toEqual([
      'ビッカメ娘のイベントか',
      '状態',
      '配布物',
      '単一イベントか',
      '店舗',
      '開始日',
      '終了日',
      '配布数',
      '配布条件'
    ])
  })

  test('選択肢は日本語に直す（日付・数量・配布条件・店舗・none）', () => {
    expect(rowOf('status').answer).toBe('告知')
    expect(rowOf('category').answer).toBe('アクスタ')
    expect(rowOf('store').answer).toBe('店舗なし')
    expect(rowOf('start_date').answer).toBe('2026-10-19')
    expect(rowOf('end_date').answer).toBe('なし')
    expect(rowOf('quantity').answer).toBe('60')
    expect(rowOf('condition').answer).toBe('購入者に配布')
  })

  test('確率は選ばれた回答のもので、noul は肯定の確率を返す', () => {
    expect(rowOf('status').probability).toBe(0.7499)
    expect(rowOf('category').probability).toBe(0.4544)
    expect(rowOf('is_event').probability).toBe(0.7224)
    expect(rowOf('single_event').probability).toBe(0.9149)
    expect(rowOf('is_event').alternatives).toEqual([])
  })

  test('しきい値以上だけが確定になり、is_event だけがイベント用のしきい値を使う', () => {
    expect(rows.filter((row) => row.confirmed).map((row) => row.key)).toEqual([
      'single_event',
      'start_date',
      'quantity',
      'condition'
    ])
    for (const key of ['status', 'category', 'store', 'end_date', 'is_event']) expect(rowOf(key).confirmed).toBe(false)
    expect(rowOf('is_event').threshold).toBe(0.9)
    const split = describeAnswers(shintouAnswers, { eventThreshold: 0.7, fieldThreshold: 0.95, ignoreThreshold: 0.5 })
    expect(split.find((row) => row.key === 'is_event')).toMatchObject({ threshold: 0.7, confirmed: true })
    expect(split.find((row) => row.key === 'single_event')).toMatchObject({ threshold: 0.95, confirmed: false })
    expect(split.find((row) => row.key === 'quantity')).toMatchObject({ threshold: 0.95, confirmed: true })
  })

  test('しきい値ちょうどは確定（evaluateDetection の >= と揃える）', () => {
    const [row] = describeAnswers({ status: choice('announce', { announce: 0.9 }) }, thresholds)
    expect(row).toMatchObject({ probability: 0.9, threshold: 0.9, confirmed: true })
  })

  test('次点は選ばれた回答を除いて確率の降順に最大2件', () => {
    expect(rowOf('status').alternatives).toEqual([
      { answer: '開始', probability: 0.15 },
      { answer: '状態なし', probability: 0.05 }
    ])
    expect(rowOf('category').alternatives).toEqual([
      { answer: 'アクキー', probability: 0.4279 },
      { answer: 'その他', probability: 0.09 }
    ])
    expect(rowOf('store').alternatives).toEqual([{ answer: '新東たん', probability: 0.3916 }])
    expect(rowOf('condition').alternatives).toEqual([
      { answer: '確定できない', probability: 0.01 },
      { answer: '先着', probability: 0.005 }
    ])
  })

  test('購入額は桁区切りの円、店舗は店舗名にする', () => {
    const result = describeAnswers(
      {
        purchase_amount: choice('p5000', { p5000: 0.8, none: 0.1, p1000: 0.05 }),
        store: choice('shintou', { shintou: 0.95, none: 0.03 })
      },
      thresholds
    )
    expect(result.map((row) => row.key)).toEqual(['store', 'purchase_amount'])
    expect(result[0]).toMatchObject({ answer: '新東たん', confirmed: true })
    expect(result[1]).toMatchObject({ label: '購入額', answer: '5,000円', confirmed: false })
    expect(result[1]?.alternatives).toEqual([
      { answer: 'なし', probability: 0.1 },
      { answer: '1,000円', probability: 0.05 }
    ])
    const none = describeAnswers({ purchase_amount: choice('none', { none: 0.9 }) }, thresholds)
    expect(none[0]?.answer).toBe('なし')
  })

  test('未知のキーは最後にキー名のまま出し、未知の選択肢でも例外にしない', () => {
    const result = describeAnswers(
      {
        zeta_question: choice('whatever', { whatever: 0.6, other: 0.3 }),
        status: choice('paused', { paused: 0.8 }),
        category: choice('plush', { plush: 0.9 }),
        store: choice('closed_store', { closed_store: 0.9 }),
        start_date: choice('d2026', { d2026: 0.9 }),
        end_date: choice('dNaN', { dNaN: 0.9 }),
        quantity: choice('q', { q: 0.9 }),
        condition: choice('future_condition', { future_condition: 0.9 }),
        purchase_amount: choice('pabc', { pabc: 0.9 }),
        alpha_score: { type: 'score', score: 3 },
        alpha_noul: { type: 'noul', noul: 0.4 },
        is_event: { type: 'noul', noul: 0.95 }
      },
      thresholds
    )
    expect(result.map((row) => row.key)).toEqual([
      'is_event',
      'status',
      'category',
      'store',
      'start_date',
      'end_date',
      'quantity',
      'condition',
      'purchase_amount',
      'zeta_question',
      'alpha_score',
      'alpha_noul'
    ])
    const answer = (key: string) => result.find((row) => row.key === key)?.answer
    expect(answer('status')).toBe('paused')
    expect(answer('category')).toBe('plush')
    expect(answer('store')).toBe('closed_store')
    expect(answer('start_date')).toBe('d2026')
    expect(answer('end_date')).toBe('dNaN')
    expect(answer('quantity')).toBe('q')
    expect(answer('condition')).toBe('future_condition')
    expect(answer('purchase_amount')).toBe('pabc')
    expect(result.find((row) => row.key === 'zeta_question')).toMatchObject({
      label: 'zeta_question',
      answer: 'whatever',
      probability: 0.6,
      confirmed: false,
      alternatives: [{ answer: 'other', probability: 0.3 }]
    })
    expect(result.find((row) => row.key === 'alpha_score')).toMatchObject({ answer: '3', probability: null })
  })

  test('選ばれた回答の確率が欠けていても確定にせず、空の回答は空の表になる', () => {
    const [row] = describeAnswers({ status: choice('announce', { start: 0.5 }) }, thresholds)
    expect(row).toMatchObject({ answer: '告知', probability: null, confirmed: false })
    expect(describeAnswers({}, thresholds)).toEqual([])
  })
})

describe('reasonLabel', () => {
  // evaluateDetection・filter・webhook-process・webhook-admin が出す全ての理由コードと、その日本語。
  const labels: Record<string, string> = {
    event_confidence_below_threshold: 'ビッカメ娘のイベントと確信できない',
    not_new_event_announcement: '新規の告知ではない',
    category_unconfirmed: '配布物を確定できない',
    store_unconfirmed: '店舗を確定できない',
    store_inferred_from_account: '店舗は投稿アカウントから補完',
    start_date_unconfirmed: '開始日を確定できない',
    end_date_unconfirmed: '終了日を確定できない',
    purchase_amount_unconfirmed: '購入額を確定できない',
    multiple_or_ambiguous_events: '複数または曖昧なイベント',
    multiple_or_ambiguous_stores: '複数または曖昧な店舗',
    distribution_condition_unconfirmed: '配布条件を確定できない',
    quantity_unconfirmed: '配布数を確定できない',
    invalid_date_range: '期間が不正',
    unmodeled_distribution_condition: '未対応の配布条件',
    invalid_event_candidate: '登録候補が不正',
    not_distribution_event: 'ビッカメ娘のイベントではない',
    no_keyword: 'キーワードなし',
    non_store_account: '店舗以外のアカウント',
    retweet: 'RT',
    reply_to_other: '他者宛てリプライ',
    excluded_keyword: '除外語',
    manually_linked: '手動で紐付け',
    manually_rejected: '手動で却下'
  }

  test.each(Object.entries(labels))('%s は日本語ラベルを持つ', (code, label) => {
    expect(reasonLabel(code)).toBe(label)
  })

  test('重複の可能性はコロン前のコードで引き、IDは含めない', () => {
    expect(reasonLabel('possible_duplicate:550e8400-e29b-41d4-a716-446655440000')).toBe('重複の可能性あり')
    expect(reasonLabel('possible_duplicate_post:2109841560305361272')).toBe('重複の可能性あり')
  })

  test('未知のコードと未知の接頭辞はそのまま返す', () => {
    expect(reasonLabel('future_reason')).toBe('future_reason')
    expect(reasonLabel('future_reason:abc')).toBe('future_reason:abc')
    expect(reasonLabel('')).toBe('')
    expect(reasonLabel('合成データ：配布条件を管理者が確認してください')).toBe(
      '合成データ：配布条件を管理者が確認してください'
    )
  })

  test('除外理由は filter の DROP_REASONS を全て網羅する', () => {
    for (const code of DROP_REASONS) expect(reasonLabel(code), code).not.toBe(code)
  })

  test('detection.ts のソースに現れる理由コードの全てにラベルがある（理由を足してラベルを忘れない）', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'detection.ts'), 'utf8')
    const codes = [...source.matchAll(/\['([a-z]+(?:_[a-z]+)+)'\]/g)].map((match) => match[1])
    expect(codes.length).toBeGreaterThanOrEqual(14)
    for (const code of codes) expect(reasonLabel(code), code).not.toBe(code)
  })

  test('evaluateDetection が実際に返す全ての理由に、対応表のラベルがある', () => {
    const post = (text: string, overrides: Partial<DetectPost> = {}): DetectPost => ({
      id: '2109221721773576390',
      createdAt: '2026-10-11T01:00:00.000Z',
      screenName: 'bic_abeno',
      kind: 'original',
      text,
      url: 'https://x.com/bic_abeno/status/2109221721773576390',
      media: [],
      ...overrides
    })
    const answersFor = (request: ClefRequest, overrides: Record<string, ClefAnswer> = {}) => {
      const answers = Object.fromEntries(
        Object.entries(request.questions).map(([key, question]): [string, ClefAnswer] => {
          if (question.type === 'noul') return [key, { type: 'noul', noul: 0.99 }]
          return [key, choice('none', { none: 0.99 })]
        })
      )
      return { answers: { ...answers, ...overrides } }
    }
    const seen = new Set<string>()
    const collect = (value: DetectPost, overrides: Record<string, ClefAnswer> = {}, event = 0.99) => {
      const request = createDetectionRequest(value)
      const result = evaluateDetection(
        value,
        request,
        answersFor(request, { is_event: { type: 'noul', noul: event }, ...overrides })
      )
      for (const reason of result.reasons) seen.add(reason)
    }
    // 全項目が「わからない」の保留、会員条件、複数店舗、逆転した期間、購入額・数量・終了日の未確定、対象外、除外。
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'))
    collect(post('あべのたん限定名刺 2026年11月3日から会員カード提示で先着100枚'), {}, 0.7)
    collect(post('あべのたん・アキバたん 限定名刺 2026年11月3日から1,000円以上お買い上げの方先着100枚'), {
      single_event: { type: 'noul', noul: 0.2 },
      condition: choice('purchase_first_come', { purchase_first_come: 0.5, none: 0.4 }),
      end_date: choice('d20261103', { d20261103: 0.5, none: 0.4 }),
      quantity: choice('q100', { q100: 0.5, none: 0.4 })
    })
    collect(post('あべのたん限定名刺 2026年11月3日から11月2日まで1,000円以上お買い上げの方先着100枚'), {
      store: choice('abeno', { abeno: 0.99 }),
      start_date: choice('d20261103', { d20261103: 0.99 }),
      end_date: choice('d20261102', { d20261102: 0.99 }),
      condition: choice('purchase_first_come', { purchase_first_come: 0.99 })
    })
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'), {}, 0.1)
    collect(post('日常のあいさつです'))
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚', { kind: 'retweet' }))
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚', { screenName: 'untrusted' }))
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚', { replyTo: { id: '1', screenName: 'someone_else' } }))
    collect(post('PCのキャンペーン終了', { screenName: 'bicpkanhonten' }))
    // 店舗を投稿アカウントから補った登録候補（情報用の理由）。
    collect(post('あべのたん限定名刺 2026年11月3日から先着100枚'), {
      status: choice('announce', { announce: 0.99 }),
      category: choice('limited_card', { limited_card: 0.99 }),
      store: choice('none', { none: 0.99 }),
      start_date: choice('d20261103', { d20261103: 0.99 }),
      end_date: choice('none', { none: 0.99 }),
      condition: choice('first_come', { first_come: 0.99 }),
      quantity: choice('q100', { q100: 0.99 })
    })
    for (const reason of ['invalid_event_candidate', 'manually_linked', 'manually_rejected']) seen.add(reason)
    // 上の入力で evaluateDetection の全ての理由を実際に出させたことを確かめる。
    for (const reason of [
      'unmodeled_distribution_condition',
      'event_confidence_below_threshold',
      'multiple_or_ambiguous_events',
      'not_new_event_announcement',
      'category_unconfirmed',
      'store_unconfirmed',
      'multiple_or_ambiguous_stores',
      'start_date_unconfirmed',
      'end_date_unconfirmed',
      'invalid_date_range',
      'distribution_condition_unconfirmed',
      'purchase_amount_unconfirmed',
      'quantity_unconfirmed',
      'not_distribution_event',
      'store_inferred_from_account',
      ...DROP_REASONS
    ])
      expect(seen.has(reason), `${reason} を出す入力がない`).toBe(true)
    for (const reason of seen) {
      expect(Object.hasOwn(labels, reason), `${reason} がテストの対応表にない`).toBe(true)
      expect(reasonLabel(reason), reason).toBe(labels[reason])
    }
  })
})
