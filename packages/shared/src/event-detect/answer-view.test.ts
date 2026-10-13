import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describeAnswers, reasonLabel } from './answer-view'
import type { ClefAnswer, ClefRequest } from './clef'
import { createDetectionRequest, evaluateDetection, FIELD_THRESHOLD_KEYS, thresholdOf } from './detection'
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
    expect(rows.filter((row) => row.confirmed).map((row) => row.key)).toEqual([
      'single_event',
      'start_date',
      'end_date',
      'quantity',
      'condition'
    ])
    for (const key of ['status', 'category', 'store', 'is_event']) expect(rowOf(key).confirmed).toBe(false)
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
        store: choice('none', { none: 0.7, shintou: 0.3 }),
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
    title_generated: 'タイトルは AI が作成',
    title_fallback: 'タイトルは定型（AI の作成に失敗）',
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
    // タイトルの理由は webhook-process.ts が付ける（evaluateDetection は出さない）。
    for (const reason of [
      'invalid_event_candidate',
      'manually_linked',
      'manually_rejected',
      'title_generated',
      'title_fallback'
    ])
      seen.add(reason)
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

describe('describeAnswers with per-field thresholds', () => {
  // 新東たんの実投稿に近い回答（status は announce 0.8536 で、共通値 0.9 には届かない）。
  const near: Record<string, ClefAnswer> = {
    is_event: { type: 'noul', noul: 0.9641 },
    status: choice('announce', { announce: 0.8536, start: 0.1 }),
    category: choice('other', { other: 0.97 }),
    single_event: { type: 'noul', noul: 0.9339 },
    start_date: choice('d20261019', { d20261019: 0.9787 }),
    end_date: choice('none', { none: 0.9976 }),
    quantity: choice('q60', { q60: 0.965 }),
    condition: choice('purchase', { purchase: 0.9865 }),
    purchase_amount: choice('p5000', { p5000: 0.9719 })
  }
  const rowsOf = (value: Parameters<typeof describeAnswers>[1]) => describeAnswers(near, value)
  const find = (rows: ReturnType<typeof describeAnswers>, key: string) => {
    const row = rows.find((entry) => entry.key === key)
    if (row === undefined) throw new Error(`Missing row ${key}`)
    return row
  }

  test('status の行のしきい値は 0.8 で announce 0.8536 は確定、category の行は 0.9', () => {
    const rows = rowsOf(thresholds)
    expect(find(rows, 'status')).toMatchObject({ threshold: 0.8, probability: 0.8536, confirmed: true })
    expect(find(rows, 'category')).toMatchObject({ threshold: 0.9, confirmed: true })
    expect(find(rows, 'is_event')).toMatchObject({ threshold: 0.9, confirmed: true })
  })

  test('fieldThresholds の上書きが各行の threshold と confirmed に出る', () => {
    const rows = rowsOf({ ...thresholds, fieldThresholds: { status: 0.9, category: 0.98, start_date: 0.5 } })
    expect(find(rows, 'status')).toMatchObject({ threshold: 0.9, confirmed: false })
    expect(find(rows, 'category')).toMatchObject({ threshold: 0.98, confirmed: false })
    expect(find(rows, 'start_date')).toMatchObject({ threshold: 0.5, confirmed: true })
    // 上書きの無い項目は既定値のまま。
    expect(find(rows, 'quantity')).toMatchObject({ threshold: 0.9, confirmed: true })
  })

  test('single_event（noul）の行も項目別のしきい値で確定を決める', () => {
    const rows = rowsOf({ ...thresholds, fieldThresholds: { single_event: 0.95 } })
    expect(find(rows, 'single_event')).toMatchObject({ threshold: 0.95, confirmed: false })
    expect(find(rowsOf(thresholds), 'single_event')).toMatchObject({ threshold: 0.9, confirmed: true })
  })

  test('is_event は fieldThresholds に左右されず eventThreshold を使う', () => {
    const rows = rowsOf({ ...thresholds, eventThreshold: 0.97, fieldThresholds: { status: 0.1, category: 0.1 } })
    expect(find(rows, 'is_event')).toMatchObject({ threshold: 0.97, confirmed: false })
  })

  test('どの行のしきい値も thresholdOf（判定と同じ関数）で引いた値と一致する', () => {
    const value = { ...thresholds, fieldThresholds: { status: 0.55, store: 0.66 } }
    for (const row of rowsOf(value)) expect(row.threshold, row.key).toBe(thresholdOf(value, row.key))
    // 未知の質問は共通値。
    const [unknown] = describeAnswers({ future_question: choice('x', { x: 0.95 }) }, value)
    expect(unknown).toMatchObject({ threshold: 0.9, confirmed: true })
    // 9項目すべてが上書きを受ける。
    const all = Object.fromEntries(FIELD_THRESHOLD_KEYS.map((key, index) => [key, 0.5 + index / 100]))
    for (const row of describeAnswers(near, { ...thresholds, fieldThresholds: all })) {
      if (row.key !== 'is_event') expect(row.threshold, row.key).toBe(all[row.key])
    }
  })
})
