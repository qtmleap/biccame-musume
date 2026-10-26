import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from './clef'
import {
  buildDetectionDraft,
  CHARACTER_CONFIRM_THRESHOLD,
  CHARACTER_DEFAULT_THRESHOLD,
  DEFAULT_DETECTION_THRESHOLDS,
  DetectionThresholdsSchema,
  FIELD_THRESHOLD_KEYS,
  FieldThresholdsSchema,
  resolveFieldThresholds,
  STATUS_DEFAULT_THRESHOLD,
  STORE_CONFIRM_THRESHOLD,
  STORE_DEFAULT_THRESHOLD,
  StoredFieldThresholdsSchema,
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
  test('対象は12項目で、回答表の質問の順。is_event と single_event（廃止）は含まない', () => {
    expect([...FIELD_THRESHOLD_KEYS]).toEqual([
      'status',
      'category',
      'store',
      'store_confirm',
      'character',
      'character_confirm',
      'start_date',
      'end_date',
      'quantity',
      'condition',
      'purchase_amount',
      'charge_amount'
    ])
    expect(STATUS_DEFAULT_THRESHOLD).toBe(0.8)
  })

  test('店舗・ビッカメ娘の1段目と確認の既定値は、どれも 70%', () => {
    expect(STORE_DEFAULT_THRESHOLD).toBe(0.7)
    expect(CHARACTER_DEFAULT_THRESHOLD).toBe(0.7)
    expect(STORE_CONFIRM_THRESHOLD).toBe(0.7)
    expect(CHARACTER_CONFIRM_THRESHOLD).toBe(0.7)
  })

  describe('resolveFieldThresholds', () => {
    // 共通値に追従せず、既定が定数の 0.7 になる 4 項目。
    const association = ['store', 'store_confirm', 'character', 'character_confirm'] as const

    test('overrides なしは status が min(共通値, 0.8)、店舗・娘の4項目が 0.7、他の7項目は共通値', () => {
      const result = resolveFieldThresholds(0.9)
      expect(result.status).toBe(0.8)
      for (const key of association) expect(result[key], key).toBe(0.7)
      for (const key of FIELD_THRESHOLD_KEYS)
        if (key !== 'status' && !association.some((value) => value === key)) expect(result[key], key).toBe(0.9)
      expect(Object.keys(result).sort()).toEqual([...FIELD_THRESHOLD_KEYS].sort())
      expect(FieldThresholdsSchema.safeParse(result).success).toBe(true)
    })

    test('店舗・娘の4項目は共通値に依らない（0.2 でも 1 でも 0.7）。status は 0.8 未満の共通値に揃う', () => {
      for (const common of [0.2, 0.5, 0.95, 1]) {
        const result = resolveFieldThresholds(common)
        for (const key of association) expect(result[key], `${key} ${common}`).toBe(0.7)
      }
      const result = resolveFieldThresholds(0.7)
      for (const key of FIELD_THRESHOLD_KEYS) expect(result[key], key).toBe(0.7)
      expect(resolveFieldThresholds(0.8).status).toBe(0.8)
    })

    test('保存済みの店舗・娘の値（0.9 など）は既定値より優先する', () => {
      const result = resolveFieldThresholds(0.9, {
        store: 0.9,
        store_confirm: 0.5,
        character: 0.6,
        character_confirm: 0.85
      })
      expect(result).toMatchObject({ store: 0.9, store_confirm: 0.5, character: 0.6, character_confirm: 0.85 })
      expect(FieldThresholdsSchema.safeParse(result).success).toBe(true)
    })

    test('共通値が変わると status と店舗・娘の4項目以外の既定値が追従する', () => {
      const result = resolveFieldThresholds(0.95)
      expect(result.status).toBe(0.8)
      expect(result.category).toBe(0.95)
      expect(result.purchase_amount).toBe(0.95)
      expect(result.charge_amount).toBe(0.95)
    })

    test('overrides のある項目はその値、無い項目は既定値', () => {
      const result = resolveFieldThresholds(0.9, { status: 0.6, start_date: 0.99, charge_amount: 0.5 })
      expect(result.status).toBe(0.6)
      expect(result.start_date).toBe(0.99)
      expect(result.charge_amount).toBe(0.5)
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

    test('12項目は項目別の有効値（上書きがあればそれ、無ければ既定値）', () => {
      expect(thresholdOf(base, 'status')).toBe(0.8)
      for (const key of ['store', 'store_confirm', 'character', 'character_confirm'])
        expect(thresholdOf(base, key), key).toBe(0.7)
      for (const key of [
        'category',
        'start_date',
        'end_date',
        'quantity',
        'condition',
        'purchase_amount',
        'charge_amount'
      ])
        expect(thresholdOf(base, key), key).toBe(0.91)
      const overridden = { ...base, fieldThresholds: { status: 0.55, end_date: 0.66, charge_amount: 0.44 } }
      expect(thresholdOf(overridden, 'status')).toBe(0.55)
      expect(thresholdOf(overridden, 'end_date')).toBe(0.66)
      expect(thresholdOf(overridden, 'charge_amount')).toBe(0.44)
      expect(thresholdOf(overridden, 'store')).toBe(0.7)
    })

    test('店舗・娘とその確認は、保存した値があればその値、共通値には依らない', () => {
      for (const key of ['store', 'store_confirm', 'character', 'character_confirm'] as const) {
        expect(thresholdOf({ ...base, fieldThresholds: { [key]: 0.9 } }, key), key).toBe(0.9)
        expect(thresholdOf({ ...base, fieldThresholds: { [key]: 0.15 } }, key), key).toBe(0.15)
        expect(thresholdOf({ ...base, fieldThreshold: 0.2 }, key), key).toBe(0.7)
        expect(thresholdOf({ ...base, fieldThreshold: 1 }, key), key).toBe(0.7)
      }
      // 別の項目の保存値は影響しない。
      expect(thresholdOf({ ...base, fieldThresholds: { store: 0.9 } }, 'character')).toBe(0.7)
      expect(thresholdOf({ ...base, fieldThresholds: { character: 0.9 } }, 'store')).toBe(0.7)
    })

    test('旧 venue.* / character.*（noul）は共通値のまま', () => {
      expect(thresholdOf(base, 'venue.abeno')).toBe(0.91)
      expect(thresholdOf(base, 'character.abeno')).toBe(0.91)
      expect(thresholdOf({ ...base, fieldThresholds: { character: 0.2 } }, 'character.abeno')).toBe(0.91)
    })

    test('未知のキーは共通値（fieldThreshold）', () => {
      expect(thresholdOf(base, 'future_question')).toBe(0.91)
      expect(thresholdOf({ ...base, fieldThresholds: { status: 0.1 } }, 'future_question')).toBe(0.91)
      // 似た名前の未知のキーは共通値のまま。
      expect(thresholdOf(base, 'store_confirm_a')).toBe(0.91)
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

    test('12項目すべて必須（状態は常に全キーを返す）で、範囲は 0 を含まず 1 以下', () => {
      expect(FieldThresholdsSchema.safeParse(full).success).toBe(true)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: 1 }).success).toBe(true)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: 0 }).success).toBe(false)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: 1.1 }).success).toBe(false)
      expect(FieldThresholdsSchema.safeParse({ ...full, status: '0.9' }).success).toBe(false)
      const { status: _status, ...missing } = full
      expect(FieldThresholdsSchema.safeParse(missing).success).toBe(false)
      expect(FieldThresholdsSchema.safeParse({ ...full, extra: 0.9 }).success).toBe(false)
      // 後から足したキーが欠けた形（旧 8 項目だけ）は、全キーの形としては不正。
      const { store_confirm: _a, character: _b, character_confirm: _c, charge_amount: _d, ...legacy } = full
      expect(FieldThresholdsSchema.safeParse(legacy).success).toBe(false)
    })
  })

  describe('StoredFieldThresholdsSchema（保存・リクエストの形）', () => {
    const full = resolveFieldThresholds(0.9)
    const { store_confirm: _a, character: _b, character_confirm: _c, charge_amount: _d, ...legacy } = full

    test('旧 8 項目だけの形も、12 項目の形も読める。後から足した 4 項目は任意', () => {
      expect(StoredFieldThresholdsSchema.safeParse(legacy).success).toBe(true)
      expect(StoredFieldThresholdsSchema.safeParse(full).success).toBe(true)
      expect(StoredFieldThresholdsSchema.safeParse({ ...legacy, character: 0.6 }).success).toBe(true)
      expect(StoredFieldThresholdsSchema.safeParse({ ...legacy, charge_amount: 0.6 }).success).toBe(true)
    })
    test('旧 8 項目は必須で、余分なキー・範囲外は不正（strictObject の方針は保つ）', () => {
      const { status: _status, ...missing } = legacy
      expect(StoredFieldThresholdsSchema.safeParse(missing).success).toBe(false)
      expect(StoredFieldThresholdsSchema.safeParse({ ...legacy, extra: 0.9 }).success).toBe(false)
      expect(StoredFieldThresholdsSchema.safeParse({ ...legacy, single_event: 0.9 }).success).toBe(false)
      expect(StoredFieldThresholdsSchema.safeParse({ ...legacy, character: 0 }).success).toBe(false)
      expect(StoredFieldThresholdsSchema.safeParse({ ...legacy, charge_amount: 1.1 }).success).toBe(false)
      expect(StoredFieldThresholdsSchema.safeParse({ ...legacy, store_confirm: '0.7' }).success).toBe(false)
    })
    test('保存の形から resolveFieldThresholds で全 12 キーの状態になり、足りないキーは既定値', () => {
      const parsed = StoredFieldThresholdsSchema.safeParse(legacy)
      if (!parsed.success) throw new Error('Expected legacy to be readable')
      const resolved = resolveFieldThresholds(0.9, parsed.data)
      expect(FieldThresholdsSchema.safeParse(resolved).success).toBe(true)
      expect(resolved).toEqual({
        ...legacy,
        store_confirm: 0.7,
        character: 0.7,
        character_confirm: 0.7,
        charge_amount: 0.9
      })
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
