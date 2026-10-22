import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from './clef'
import {
  buildDetectionDraft,
  DEFAULT_DETECTION_THRESHOLDS,
  DetectionThresholdsSchema,
  type evaluateDetection,
  FIELD_THRESHOLD_KEYS,
  FieldThresholdsSchema,
  resolveFieldThresholds,
  STATUS_DEFAULT_THRESHOLD,
  STORE_DEFAULT_THRESHOLD,
  thresholdOf
} from './detection'
import {
  choice,
  evaluateWithStore,
  post,
  requestWithAssociations,
  response,
  shintouOverrides,
  shintouPostText
} from './detection-test-fixtures'

describe('Field thresholds', () => {
  test('対象は8項目で、is_event と対象外は含まない', () => {
    expect([...FIELD_THRESHOLD_KEYS]).toEqual([
      'status',
      'category',
      'store',
      'start_date',
      'end_date',
      'quantity',
      'condition',
      'purchase_amount'
    ])
    expect(STATUS_DEFAULT_THRESHOLD).toBe(0.8)
  })

  describe('resolveFieldThresholds', () => {
    test('overrides なしは status が min(共通値, 0.8)、store が min(共通値, 0.3)、他の6項目は共通値', () => {
      const result = resolveFieldThresholds(0.9)
      expect(result.status).toBe(0.8)
      expect(result.store).toBe(STORE_DEFAULT_THRESHOLD)
      for (const key of FIELD_THRESHOLD_KEYS)
        if (key !== 'status' && key !== 'store') expect(result[key], key).toBe(0.9)
      expect(Object.keys(result).sort()).toEqual([...FIELD_THRESHOLD_KEYS].sort())
      expect(FieldThresholdsSchema.safeParse(result).success).toBe(true)
    })

    test('共通値が 0.8 未満なら status も共通値に揃う（0.7 なら 0.7）。store は 0.3 以下の共通値にだけ揃う', () => {
      const result = resolveFieldThresholds(0.7)
      for (const key of FIELD_THRESHOLD_KEYS) expect(result[key], key).toBe(key === 'store' ? 0.3 : 0.7)
      expect(resolveFieldThresholds(0.8).status).toBe(0.8)
      expect(resolveFieldThresholds(0.2).store).toBe(0.2)
    })

    test('保存済みの store の値（0.9 など）は既定値より優先する', () => {
      expect(resolveFieldThresholds(0.9, { store: 0.9 }).store).toBe(0.9)
      expect(resolveFieldThresholds(0.9, { store: 0.5 }).store).toBe(0.5)
    })

    test('共通値が変わると status 以外の既定値が追従する', () => {
      const result = resolveFieldThresholds(0.95)
      expect(result.status).toBe(0.8)
      expect(result.category).toBe(0.95)
      expect(result.purchase_amount).toBe(0.95)
    })

    test('overrides のある項目はその値、無い項目は既定値', () => {
      const result = resolveFieldThresholds(0.9, { status: 0.6, start_date: 0.99 })
      expect(result.status).toBe(0.6)
      expect(result.start_date).toBe(0.99)
      expect(result.category).toBe(0.9)
      expect(resolveFieldThresholds(0.9, {})).toEqual(resolveFieldThresholds(0.9))
    })
  })

  describe('thresholdOf', () => {
    const base = { eventThreshold: 0.93, fieldThreshold: 0.91, ignoreThreshold: 0.5 }

    test('is_event は eventThreshold', () => {
      expect(thresholdOf(base, 'is_event')).toBe(0.93)
      expect(thresholdOf({ ...base, fieldThresholds: { status: 0.1 } }, 'is_event')).toBe(0.93)
    })

    test('8項目は項目別の有効値（上書きがあればそれ、無ければ既定値）', () => {
      expect(thresholdOf(base, 'status')).toBe(0.8)
      expect(thresholdOf(base, 'store')).toBe(0.3)
      for (const key of FIELD_THRESHOLD_KEYS)
        if (key !== 'status' && key !== 'store') expect(thresholdOf(base, key), key).toBe(0.91)
      const overridden = { ...base, fieldThresholds: { status: 0.55, end_date: 0.66 } }
      expect(thresholdOf(overridden, 'status')).toBe(0.55)
      expect(thresholdOf(overridden, 'end_date')).toBe(0.66)
      expect(thresholdOf(overridden, 'store')).toBe(0.3)
      expect(thresholdOf({ ...base, fieldThresholds: { store: 0.9 } }, 'store')).toBe(0.9)
    })

    test('対象ビッカメ娘は min(共通値, 0.3)、旧 venue.* / character.*（noul）は共通値のまま', () => {
      expect(thresholdOf(base, 'character')).toBe(0.3)
      expect(thresholdOf({ ...base, fieldThreshold: 0.2 }, 'character')).toBe(0.2)
      expect(thresholdOf({ ...base, fieldThresholds: { store: 0.5 } }, 'character')).toBe(0.3)
      expect(thresholdOf(base, 'venue.abeno')).toBe(0.91)
      expect(thresholdOf(base, 'character.abeno')).toBe(0.91)
    })

    test('未知のキーは共通値（fieldThreshold）', () => {
      expect(thresholdOf(base, 'future_question')).toBe(0.91)
      expect(thresholdOf({ ...base, fieldThresholds: { status: 0.1 } }, 'future_question')).toBe(0.91)
    })
  })

  describe('DetectionThresholdsSchema', () => {
    const base = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 }

    test('fieldThresholds は任意で、3値だけの呼び出しもそのまま通る', () => {
      expect(DetectionThresholdsSchema.safeParse(base).success).toBe(true)
      expect(DetectionThresholdsSchema.safeParse(DEFAULT_DETECTION_THRESHOLDS).success).toBe(true)
      expect(DetectionThresholdsSchema.safeParse({ ...base, fieldThresholds: { status: 0.5 } }).success).toBe(true)
    })

    test('範囲外・未知のキーは不正', () => {
      for (const fieldThresholds of [{ status: 0 }, { status: 1.1 }, { unknown: 0.5 }, { status: Number.NaN }]) {
        expect(DetectionThresholdsSchema.safeParse({ ...base, fieldThresholds }).success).toBe(false)
      }
    })
  })

  describe('FieldThresholdsSchema', () => {
    const full = resolveFieldThresholds(0.9)

    test('8項目すべて必須で、範囲は 0 を含まず 1 以下', () => {
      expect(FieldThresholdsSchema.safeParse(full).success).toBe(true)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: 1 }).success).toBe(true)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: 0 }).success).toBe(false)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: 1.1 }).success).toBe(false)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: '0.9' }).success).toBe(false)
      const { status: _status, ...missing } = full
      expect(FieldThresholdsSchema.safeParse(missing).success).toBe(false)
      expect(FieldThresholdsSchema.safeParse({ ...full, extra: 0.9 }).success).toBe(false)
    })
  })

  describe('evaluateDetection', () => {
    // 新東たんの実投稿に近い回答。開催店舗と対象キャラの独立質問も回答済みとする。
    // 条件は購入＋先着（保留規則を通る形）にするため、本文に「先着順」を足す。
    const shintou = post(`${shintouPostText}\n先着順`, shintouOverrides)
    const request = requestWithAssociations(shintou)
    const answersWith = (overrides: Record<string, ClefAnswer> = {}) =>
      response(request, {
        is_event: { type: 'noul', noul: 0.9641 },
        status: choice('announce', { announce: 0.8536, start: 0.1 }),
        category: choice('other', { other: 0.97 }),
        single_event: { type: 'noul', noul: 0.9339 },
        start_date: choice('d20261019', { d20261019: 0.9787 }),
        end_date: choice('none', { none: 0.9976 }),
        quantity: choice('q60', { q60: 0.965 }),
        condition: choice('purchase_first_come', { purchase_first_come: 0.9865 }),
        purchase_amount: choice('p5000', { p5000: 0.9719 }),
        ...overrides
      })
    const evaluate = (
      overrides: Record<string, ClefAnswer> = {},
      fieldThresholds?: Partial<Record<(typeof FIELD_THRESHOLD_KEYS)[number], number>>
    ) =>
      evaluateWithStore(shintou, request, answersWith(overrides), {
        ...DEFAULT_DETECTION_THRESHOLDS,
        ...(fieldThresholds === undefined ? {} : { fieldThresholds })
      })

    test('既定値のままでも status announce 0.8536 は通り、登録される（category は other）', () => {
      const result = evaluate()
      expect(result.status).toBe('register')
      expect(result.reasons).toEqual([])
      if (result.status !== 'register') throw new Error('Expected candidate')
      expect(result.candidate.category).toBe('other')
      expect(result.candidate.stores).toEqual(['shintou'])
    })

    test('status は 0.8 未満なら status_unconfirmed で保留、ちょうど 0.8 は通る', () => {
      expect(evaluate({ status: choice('announce', { announce: 0.79, start: 0.1 }) })).toMatchObject({
        status: 'held',
        reasons: ['status_unconfirmed']
      })
      expect(evaluate({ status: choice('announce', { announce: 0.8, start: 0.1 }) }).status).toBe('register')
    })

    test('status を 0.5 に下げれば 0.6 でも通り、0.9 に上げれば 0.8536 でも保留になる', () => {
      const low = { status: choice('announce', { announce: 0.6, start: 0.3 }) }
      expect(evaluate(low).status).toBe('held')
      expect(evaluate(low, { status: 0.5 }).status).toBe('register')
      expect(evaluate({}, { status: 0.9 })).toMatchObject({ status: 'held', reasons: ['status_unconfirmed'] })
    })

    test('start_date を 0.99 にすると 0.9787 は start_date_unconfirmed で保留する', () => {
      expect(evaluate({}, { start_date: 0.99 })).toMatchObject({ status: 'held', reasons: ['start_date_unconfirmed'] })
    })

    test('category・quantity・condition・purchase_amount も項目ごとの値で効く', () => {
      expect(evaluate({}, { category: 0.98 })).toMatchObject({ status: 'held', reasons: ['category_unconfirmed'] })
      // 配布数が確定しない先着は、保留規則（配布数なしの先着）で保留する。
      expect(evaluate({}, { quantity: 0.97 })).toMatchObject({
        status: 'held',
        reasons: ['condition_pattern_unconfirmed']
      })
      expect(evaluate({}, { condition: 0.99 })).toMatchObject({
        status: 'held',
        reasons: ['distribution_condition_unconfirmed']
      })
      expect(evaluate({}, { purchase_amount: 0.98 })).toMatchObject({
        status: 'held',
        reasons: ['purchase_amount_unconfirmed']
      })
    })

    test('下げた項目だけが通り、他の項目は既定値のまま判定される', () => {
      const answers = { category: choice('other', { other: 0.7 }), start_date: choice('d20261019', { d20261019: 0.7 }) }
      expect(evaluate(answers).status).toBe('held')
      expect(evaluate(answers, { category: 0.7 })).toMatchObject({
        status: 'held',
        reasons: ['start_date_unconfirmed']
      })
      expect(evaluate(answers, { category: 0.7, start_date: 0.7 }).status).toBe('register')
    })

    test('end_date: none が最有力なら項目別のしきい値に関わらず確定し、日付が最有力ならしきい値を要求する', () => {
      const none = { end_date: choice('none', { none: 0.6, d20261019: 0.3 }) }
      expect(evaluate(none).status).toBe('register')
      expect(evaluate(none, { end_date: 0.99 }).status).toBe('register')
      const date = { end_date: choice('d20261019', { d20261019: 0.95, none: 0.04 }) }
      expect(evaluate(date).status).toBe('register')
      expect(evaluate(date, { end_date: 0.99 })).toMatchObject({ status: 'held', reasons: ['end_date_unconfirmed'] })
      const low = { end_date: choice('d20261019', { d20261019: 0.6, none: 0.3 }) }
      expect(evaluate(low).status).toBe('held')
      expect(evaluate(low, { end_date: 0.5 }).status).toBe('register')
    })

    test('開催店舗はstore項目別のしきい値で選ばれた店舗を採用し、届かなければ保留する', () => {
      // 投稿元ではなく、店舗の質問（choice 1 問）で選ばれた店舗の確率を使う。
      const value = post(
        'ビックカメラ秋葉原店で限定名刺を2026年11月3日から1,000円以上お買い上げの方に先着100枚配布します'
      )
      const asked = requestWithAssociations(value)
      const run = (fieldThresholds?: { store: number }) =>
        evaluateWithStore(value, asked, response(asked, { store: choice('abeno', { abeno: 0.99, none: 0.01 }) }), {
          ...DEFAULT_DETECTION_THRESHOLDS,
          ...(fieldThresholds === undefined ? {} : { fieldThresholds })
        })
      expect(run()).toMatchObject({ status: 'register', reasons: [] })
      expect(run({ store: 0.995 })).toMatchObject({ status: 'held', reasons: ['store_unconfirmed'] })
    })

    test('対象ビッカメ娘は min(共通値, 0.3) を使い、store 項目別のしきい値には影響されない', () => {
      // 最上位をそのまま採用するので、確率が散っていても 0.3 以上なら採用する。
      const spread = answersWith({ character: choice('shintou', { shintou: 0.32, none: 0.2, abeno: 0.1 }) })
      const run = (answers: typeof spread, thresholds: Parameters<typeof evaluateDetection>[3]) =>
        evaluateWithStore(shintou, request, answers, thresholds)
      expect(run(spread, DEFAULT_DETECTION_THRESHOLDS).status).toBe('register')
      // 0.3 に届かない選択は採用せず保留する。共通値を下げれば、それに従って下限も下がる。
      const low = answersWith({ character: choice('shintou', { shintou: 0.25, none: 0.2, abeno: 0.1 }) })
      expect(run(low, DEFAULT_DETECTION_THRESHOLDS)).toMatchObject({
        status: 'held',
        reasons: ['character_unconfirmed']
      })
      expect(run(low, { ...DEFAULT_DETECTION_THRESHOLDS, fieldThreshold: 0.2 }).status).toBe('register')
      // 店舗の項目別のしきい値は娘に影響しない。
      expect(run(spread, { ...DEFAULT_DETECTION_THRESHOLDS, fieldThresholds: { store: 0.995 } })).toMatchObject({
        status: 'held',
        reasons: ['store_unconfirmed']
      })
    })

    test('is_event は参考値で、eventThreshold や fieldThresholds を変えても判定に使わない', () => {
      const all = Object.fromEntries(FIELD_THRESHOLD_KEYS.map((key) => [key, 0.1]))
      for (const thresholds of [
        { ...DEFAULT_DETECTION_THRESHOLDS, fieldThresholds: all },
        { ...DEFAULT_DETECTION_THRESHOLDS, eventThreshold: 1 }
      ])
        expect(
          evaluateWithStore(shintou, request, answersWith({ is_event: { type: 'noul', noul: 0.8 } }), thresholds)
        ).toMatchObject({ status: 'register', confidence: 0.8 })
    })

    test('共通値 fieldThreshold を上げても status の既定値は 0.8 のまま、他の項目は追従する', () => {
      const answers = answersWith({ category: choice('other', { other: 0.92 }) })
      expect(evaluateWithStore(shintou, request, answers, DEFAULT_DETECTION_THRESHOLDS).status).toBe('register')
      // 共通値 0.93 では category 0.92 が届かない。一方 status 0.8536 は既定値 0.8 のままなので通る。
      const strict = { ...DEFAULT_DETECTION_THRESHOLDS, fieldThreshold: 0.93 }
      expect(evaluateWithStore(shintou, request, answers, strict)).toMatchObject({
        status: 'held',
        reasons: ['category_unconfirmed']
      })
    })

    test('不正な fieldThresholds は検証で投げる', () => {
      expect(() =>
        evaluateWithStore(shintou, request, answersWith(), {
          ...DEFAULT_DETECTION_THRESHOLDS,
          fieldThresholds: { status: 0 }
        })
      ).toThrow('Invalid detection thresholds')
    })
  })

  test('下書きは最有力候補（argmax）で作り、項目別のしきい値に影響されない', () => {
    const shintou = post(shintouPostText, shintouOverrides)
    const request = requestWithAssociations(shintou)
    const answers = {
      ...response(request).answers,
      status: choice('announce', { announce: 0.3, start: 0.2 }),
      category: choice('other', { other: 0.62, acsta: 0.2 })
    }
    expect(buildDetectionDraft(shintou, answers)).toMatchObject({ category: 'other', stores: ['shintou'] })
  })
})
