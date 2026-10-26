import { describe, expect, test } from 'bun:test'
import { describeAnswers } from './answer-view'
import { choice, shintouAnswers, thresholds } from './answer-view-test-fixtures'

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
      '開催・配布店舗',
      '開始日',
      '終了日',
      '配布数',
      '配布条件'
    ])
  })

  test('store を質問しない投稿の回答（店舗の行が無い）でも、他の行は固定の順で並ぶ', () => {
    const { store: _store, ...withoutStore } = shintouAnswers
    expect(describeAnswers(withoutStore, thresholds).map((row) => row.key)).toEqual([
      'is_event',
      'status',
      'category',
      'single_event',
      'start_date',
      'end_date',
      'quantity',
      'condition'
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

  test('確率は表示した回答のもの。noul は P(はい) が 0.5 以上なら「はい」とその確率、反対の「いいえ」を次点に出す', () => {
    expect(rowOf('status').probability).toBe(0.7499)
    expect(rowOf('category').probability).toBe(0.4544)
    expect(rowOf('is_event')).toMatchObject({ answer: 'はい', probability: 0.7224 })
    expect(rowOf('single_event')).toMatchObject({ answer: 'はい', probability: 0.9149 })
    // 1 - 0.7224 は浮動小数点では 0.27759999999999996 になるため、4桁に丸めた値で比べる。
    expect(rowOf('is_event').alternatives).toEqual([{ answer: 'いいえ', probability: 0.2776 }])
    expect(rowOf('single_event').alternatives).toEqual([{ answer: 'いいえ', probability: 0.0851 }])
  })

  test('noul は P(はい) が 0.5 未満なら「いいえ」とその確率を出し、P(はい) を次点に残す', () => {
    const [row] = describeAnswers({ is_event: { type: 'noul', noul: 0.186 } }, thresholds)
    expect(row).toMatchObject({
      key: 'is_event',
      answer: 'いいえ',
      probability: 0.814,
      threshold: 0.9,
      confirmed: false,
      alternatives: [{ answer: 'はい', probability: 0.186 }]
    })
  })

  test('noul のちょうど 0.5 は「はい」', () => {
    const [row] = describeAnswers({ single_event: { type: 'noul', noul: 0.5 } }, thresholds)
    expect(row).toMatchObject({
      answer: 'はい',
      probability: 0.5,
      alternatives: [{ answer: 'いいえ', probability: 0.5 }]
    })
  })

  test('noul の確定は表示した回答ではなく P(はい) をしきい値と比べる（evaluateDetection と揃える）', () => {
    const low = describeAnswers({ is_event: { type: 'noul', noul: 0.05 } }, thresholds)
    // 「いいえ 95%」でも、P(はい) が 0.05 でしきい値 0.9 を下回るので確定ではない。
    expect(low[0]).toMatchObject({ answer: 'いいえ', probability: 0.95, confirmed: false })
    const exact = describeAnswers({ is_event: { type: 'noul', noul: 0.9 } }, thresholds)
    expect(exact[0]).toMatchObject({ answer: 'はい', probability: 0.9, confirmed: true })
  })

  test('しきい値以上と、最有力が none の終了日だけが確定になり、is_event だけがイベント用のしきい値を使う', () => {
    // end_date は none 0.541 でしきい値未満だが、最有力が none（終了日の記載なし）なので確定。
    // store の既定のしきい値は 0.7 なので、none 0.6084 は未確定の表示になる（確認の行が無い保存データ。none は確率が高くても採用されず保留）。
    expect(rows.filter((row) => row.confirmed).map((row) => row.key)).toEqual([
      'single_event',
      'start_date',
      'end_date',
      'quantity',
      'condition'
    ])
    for (const key of ['status', 'category', 'is_event']) expect(rowOf(key).confirmed).toBe(false)
    expect(rowOf('is_event').threshold).toBe(0.9)
    const split = describeAnswers(shintouAnswers, { eventThreshold: 0.7, fieldThreshold: 0.95, ignoreThreshold: 0.5 })
    expect(split.find((row) => row.key === 'is_event')).toMatchObject({ threshold: 0.7, confirmed: true })
    expect(split.find((row) => row.key === 'single_event')).toMatchObject({ threshold: 0.95, confirmed: false })
    expect(split.find((row) => row.key === 'quantity')).toMatchObject({ threshold: 0.95, confirmed: true })
  })

  test('終了日は最有力が none（0.7348）ならしきい値未満でも確定、最有力が日付（0.6）なら未確定', () => {
    const none = describeAnswers({ end_date: choice('none', { none: 0.7348, d20261019: 0.2652 }) }, thresholds)
    expect(none[0]).toMatchObject({
      key: 'end_date',
      answer: 'なし',
      probability: 0.7348,
      threshold: 0.9,
      confirmed: true,
      alternatives: [{ answer: '2026-10-19', probability: 0.2652 }]
    })
    const date = describeAnswers({ end_date: choice('d20261019', { d20261019: 0.6, none: 0.4 }) }, thresholds)
    expect(date[0]).toMatchObject({ answer: '2026-10-19', probability: 0.6, confirmed: false })
    const confident = describeAnswers({ end_date: choice('d20261019', { d20261019: 0.95, none: 0.05 }) }, thresholds)
    expect(confident[0]).toMatchObject({ confirmed: true })
  })

  test('none を確定扱いにするのは終了日だけで、他の項目の none はしきい値で判定する', () => {
    const rowsOfNone = describeAnswers(
      {
        start_date: choice('none', { none: 0.7, d20261019: 0.3 }),
        quantity: choice('none', { none: 0.7, q60: 0.3 }),
        store: choice('none', { none: 0.25, shintou: 0.2 }),
        end_date: choice('none', { none: 0.7, d20261019: 0.3 })
      },
      thresholds
    )
    expect(rowsOfNone.map((row) => [row.key, row.confirmed])).toEqual([
      ['store', false],
      ['start_date', false],
      ['end_date', true],
      ['quantity', false]
    ])
  })

  test('しきい値ちょうどは確定（evaluateDetection の >= と揃える）', () => {
    const [row] = describeAnswers({ category: choice('other', { other: 0.9 }) }, thresholds)
    expect(row).toMatchObject({ probability: 0.9, threshold: 0.9, confirmed: true })
    // status の既定のしきい値は 0.8。ちょうどでも確定、わずかに下回れば未確定。
    const [exact] = describeAnswers({ status: choice('announce', { announce: 0.8 }) }, thresholds)
    expect(exact).toMatchObject({ probability: 0.8, threshold: 0.8, confirmed: true })
    const [below] = describeAnswers({ status: choice('announce', { announce: 0.7999 }) }, thresholds)
    expect(below).toMatchObject({ threshold: 0.8, confirmed: false })
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
    // 次点の店舗名は「ビックカメラ」を付けない店舗の短い名前（キャラクター名ではない）。
    expect(rowOf('store').alternatives).toEqual([{ answer: '新宿東口駅前店', probability: 0.3916 }])
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
    expect(result[0]).toMatchObject({ answer: '新宿東口駅前店', confirmed: true })
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
