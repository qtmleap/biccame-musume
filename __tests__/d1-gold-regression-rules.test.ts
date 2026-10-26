import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import {
  CHARACTER_DEFAULT_THRESHOLD,
  DEFAULT_DETECTION_THRESHOLDS,
  FieldThresholdsSchema,
  resolveFieldThresholds,
  STORE_DEFAULT_THRESHOLD,
  thresholdOf
} from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import {
  associationAnswers,
  choice,
  evaluateWithStore,
  post,
  requestWithAssociations,
  response
} from '../packages/shared/src/event-detect/detection-test-fixtures'

// 自動登録の精度のための保留規則（COND / ESN / CHG）と、店舗・娘の最上位採用の単体テスト。
// 規則の根拠は docs/event-detection-golden.md。保存した実応答での効果は d1-gold-regression.test.ts が見る。

const PERIOD = '2026年11月3日から11月30日まで'
const answersFor = (value: DetectPost, overrides: Record<string, ClefAnswer>, storeKey?: string | null) => {
  const request = requestWithAssociations(value)
  return evaluateWithStore(value, request, response(request, overrides), undefined, storeKey)
}
const start = { start_date: choice('d20261103', { d20261103: 0.99 }) }
const end = { end_date: choice('d20261130', { d20261130: 0.99 }) }
const noEnd = { end_date: choice('none', { none: 0.99 }) }
const goods = { category: choice('ackey', { ackey: 0.99 }) }

describe('COND: 配布条件の組み合わせ', () => {
  const everyone = post(`あべのたんアクキーを${PERIOD}どなたでも配布します`)
  const purchaseFirstCome = post(`あべのたんアクキーを${PERIOD}1,000円以上お買い上げの方に先着100枚配布します`)
  const purchaseOnly = post(`あべのたんアクキーを${PERIOD}1,000円以上お買い上げの方に配布します`)
  const firstComeOnly = post(`あべのたんアクキーを${PERIOD}先着100枚配布します`)
  const firstComeNoQuantity = post(`あべのたんアクキーを${PERIOD}先着順で配布します`)

  test('[everyone] のみと、購入（金額あり）＋先着（配布数あり）の 2 件ちょうどは登録に進む', () => {
    const all = answersFor(everyone, { ...goods, ...start, condition: choice('everyone', { everyone: 0.99 }) })
    expect(all).toMatchObject({ status: 'register', reasons: [], candidate: { conditions: [{ type: 'everyone' }] } })
    const full = answersFor(purchaseFirstCome, { ...goods, ...start })
    expect(full).toMatchObject({ status: 'register', reasons: [] })
    if (full.status !== 'register') throw new Error('Expected registration')
    expect(full.candidate.conditions).toEqual([
      { type: 'purchase', purchaseAmount: 1000 },
      { type: 'first_come', quantity: 100 }
    ])
  })

  test('購入のみ・先着のみ・配布数なしの先着は保留し、条件そのものは下書きに残る', () => {
    const cases: [DetectPost, ClefAnswer][] = [
      [purchaseOnly, choice('purchase', { purchase: 0.99 })],
      [firstComeOnly, choice('first_come', { first_come: 0.99 })],
      [firstComeNoQuantity, choice('first_come', { first_come: 0.99 })]
    ]
    for (const [value, condition] of cases) {
      const result = answersFor(value, { ...goods, ...start, condition })
      expect(result, value.text).toMatchObject({ status: 'held', reasons: ['condition_pattern_unconfirmed'] })
      expect(result).not.toHaveProperty('candidate')
    }
  })

  test('他の理由と併記できる（条件の保留理由だけが残るわけではない）', () => {
    const result = answersFor(
      purchaseOnly,
      { ...goods, ...start, condition: choice('purchase', { purchase: 0.99 }) },
      'akiba'
    )
    expect(result.reasons).toEqual(['store_mismatch', 'condition_pattern_unconfirmed'])
  })

  test('購入額が未確定のときは purchase_amount_unconfirmed に任せ、組み合わせの理由は重ねない', () => {
    const result = answersFor(purchaseFirstCome, {
      ...goods,
      ...start,
      purchase_amount: choice('p1000', { p1000: 0.5, none: 0.4 })
    })
    expect(result).toMatchObject({ status: 'held', reasons: ['purchase_amount_unconfirmed'] })
  })

  test('継続・終了の投稿には付けない（既存の理由だけ）', () => {
    const result = answersFor(purchaseOnly, {
      ...goods,
      ...start,
      condition: choice('purchase', { purchase: 0.99 }),
      status: choice('ongoing', { ongoing: 0.99 })
    })
    expect(result).toMatchObject({ status: 'held', reasons: ['existing_event_update'] })
  })
})

describe('名刺の終了日（END は試して外した）', () => {
  const card = post(`あべのたん限定名刺を${PERIOD}どなたでも配布します`)
  const everyone = { condition: choice('everyone', { everyone: 0.99 }), ...start }

  test('限定名刺・通常名刺で終了日なしでも、他の理由が無ければ保留せず登録に進む', () => {
    for (const category of ['limited_card', 'regular_card']) {
      const value = post(`あべのたん限定名刺・通常名刺を${PERIOD}どなたでも配布します`)
      const result = answersFor(value, { ...everyone, ...noEnd, category: choice(category, { [category]: 0.99 }) })
      expect(result, category).toMatchObject({ status: 'register', reasons: [] })
      expect(result).not.toHaveProperty('candidate.endDate')
    }
  })

  test('名刺で終了日があれば、その日付で登録に進む', () => {
    expect(
      answersFor(card, { ...everyone, ...end, category: choice('limited_card', { limited_card: 0.99 }) })
    ).toMatchObject({
      status: 'register',
      candidate: { endDate: '2026-11-30' }
    })
  })

  test('終了日が日付で確率が足りない名刺は、end_date_unconfirmed だけを理由にする', () => {
    const result = answersFor(card, {
      ...everyone,
      category: choice('limited_card', { limited_card: 0.99 }),
      end_date: choice('d20261130', { d20261130: 0.6, none: 0.3 })
    })
    expect(result).toMatchObject({ status: 'held', reasons: ['end_date_unconfirmed'] })
  })
})

describe('ESN: 抽出段階の開催店舗候補', () => {
  const value = post(`あべのたんアクキーを${PERIOD}どなたでも配布します`)
  const overrides = { ...goods, ...start, ...noEnd, condition: choice('everyone', { everyone: 0.99 }) }

  test('storeKey が null の候補は保留する', () => {
    expect(answersFor(value, overrides, null)).toMatchObject({
      status: 'held',
      reasons: ['extraction_store_unspecified']
    })
  })

  test('選ばれた店舗と一致する storeKey があれば登録し、食い違えば store_mismatch で保留する（ESN は付かない）', () => {
    expect(answersFor(value, overrides, 'abeno')).toMatchObject({ status: 'register' })
    expect(answersFor(value, overrides, 'akiba')).toMatchObject({ status: 'held', reasons: ['store_mismatch'] })
  })

  test('店舗が確定しないときは、storeKey が null でも store_unconfirmed と併記する', () => {
    const none = answersFor(value, { ...overrides, store: choice('none', { none: 0.9 }) }, null)
    expect(none).toMatchObject({ status: 'held', reasons: ['store_unconfirmed', 'extraction_store_unspecified'] })
  })
})

describe('CHG: 入金・チャージ条件', () => {
  const value = post(`あべのたんアクキーを${PERIOD}1,000円以上入金の方に先着100枚配布します`)
  const overrides = {
    ...goods,
    ...start,
    condition: choice('charge_first_come', { charge_first_come: 0.99 }),
    charge_amount: choice('p1000', { p1000: 0.99 })
  }

  test('入金を含む条件は保留する（組み合わせの規則とも併記）', () => {
    const result = answersFor(value, overrides)
    expect(result).toMatchObject({
      status: 'held',
      reasons: ['condition_pattern_unconfirmed', 'charge_condition_unconfirmed']
    })
  })

  test('購入＋入金＋先着も保留する', () => {
    const mixed = post(`あべのたんアクキーを${PERIOD}4,000円以上購入し、1,000円以上チャージした方に先着100枚配布します`)
    const result = answersFor(mixed, {
      ...overrides,
      condition: choice('purchase_charge_first_come', { purchase_charge_first_come: 0.99 }),
      purchase_amount: choice('p4000', { p4000: 0.99 })
    })
    expect(result.reasons).toContain('charge_condition_unconfirmed')
  })
})

describe('店舗・ビッカメ娘は最上位を採用する', () => {
  const value = post(`あべのたんアクキーを${PERIOD}どなたでも配布します`)
  const request = requestWithAssociations(value)
  const base = { ...goods, ...start, ...noEnd, condition: choice('everyone', { everyone: 0.99 }) }
  const run = (overrides: Record<string, ClefAnswer>, thresholds = DEFAULT_DETECTION_THRESHOLDS) =>
    evaluateWithStore(value, request, response(request, { ...base, ...overrides }), thresholds, 'abeno')

  test('確率 0.5 でも最上位なら登録に進む（既定の 90% を求めない）', () => {
    const spread = {
      store: choice('abeno', { abeno: 0.5, takatsuki: 0.2, akiba: 0.1 }),
      character: choice('abeno', { abeno: 0.5, shinyoko: 0.2, akiba: 0.1 })
    }
    expect(run(spread)).toMatchObject({ status: 'register', reasons: [] })
  })

  test('multiple と none は最上位でも採用せず保留する（娘の other と secret は採用する）', () => {
    expect(run(associationAnswers('multiple', 'abeno')).reasons).toEqual(['store_unconfirmed'])
    expect(run(associationAnswers('none', 'abeno')).reasons).toEqual(['store_unconfirmed'])
    expect(run(associationAnswers('abeno', 'multiple')).reasons).toEqual(['character_unconfirmed'])
    expect(run(associationAnswers('abeno', 'none')).reasons).toEqual(['character_unconfirmed'])
    for (const special of ['other', 'secret'])
      expect(run(associationAnswers('abeno', special)).status, special).toBe('register')
  })

  test('下限（0.3）に届かない選択は採用しない（娘は店舗の娘になる）', () => {
    const low = { abeno: 0.25, takatsuki: 0.2 }
    expect(run({ store: choice('abeno', low) }).reasons).toEqual(['store_unconfirmed'])
    // 娘が明示されていない（確率不足）ときは、採用した店舗の娘で登録に進む。下限に届いた別の娘は、そのまま採用する。
    const lowCharacter = run({ character: choice('takatsuki', { takatsuki: 0.25, abeno: 0.2 }) })
    expect(lowCharacter).toMatchObject({ status: 'register', reasons: [], candidate: { characterIds: ['abeno'] } })
    const explicit = run({ character: choice('takatsuki', { takatsuki: 0.35, abeno: 0.2 }) })
    expect(explicit).toMatchObject({ status: 'register', reasons: [], candidate: { characterIds: ['takatsuki'] } })
  })

  test('確率が下限に届かなくても、最上位が multiple・none なら店舗の娘にせず保留する', () => {
    for (const top of ['multiple', 'none'])
      expect(run({ character: choice(top, { [top]: 0.25, abeno: 0.2 }) }).reasons).toEqual(['character_unconfirmed'])
  })

  test('両方 none を確信しているときだけ対象外にする（none の確率が低いと保留）', () => {
    expect(run(associationAnswers('none', 'none')).status).toBe('ignored')
    const weak = {
      store: choice('none', { none: 0.5, abeno: 0.2 }),
      character: choice('none', { none: 0.5, abeno: 0.2 })
    }
    expect(run(weak).status).toBe('held')
  })
})

describe('KV に保存済みの設定との互換', () => {
  test('項目別のしきい値は 8 キーのまま（キーを足していない）で、旧形式の保存値も検証を通る', () => {
    expect(Object.keys(resolveFieldThresholds(0.9)).sort()).toEqual(
      ['category', 'condition', 'end_date', 'purchase_amount', 'quantity', 'start_date', 'status', 'store'].sort()
    )
    const legacy = {
      status: 0.8,
      category: 0.85,
      store: 0.9,
      start_date: 0.9,
      end_date: 0.9,
      quantity: 0.9,
      condition: 0.9,
      purchase_amount: 0.9
    }
    expect(FieldThresholdsSchema.safeParse(legacy).success).toBe(true)
    expect(FieldThresholdsSchema.safeParse({ ...legacy, character: 0.3 }).success).toBe(false)
  })

  test('未保存なら store の既定は 0.3、保存済みの値（0.9 など）は下限で上書きせず優先する', () => {
    expect(thresholdOf(DEFAULT_DETECTION_THRESHOLDS, 'store')).toBe(STORE_DEFAULT_THRESHOLD)
    const saved = { ...DEFAULT_DETECTION_THRESHOLDS, fieldThresholds: resolveFieldThresholds(0.9, { store: 0.9 }) }
    expect(thresholdOf(saved, 'store')).toBe(0.9)
    const value = post(`あべのたんアクキーを${PERIOD}どなたでも配布します`)
    const request = requestWithAssociations(value)
    const answers = response(request, {
      category: choice('ackey', { ackey: 0.99 }),
      start_date: choice('d20261103', { d20261103: 0.99 }),
      end_date: choice('none', { none: 0.99 }),
      condition: choice('everyone', { everyone: 0.99 }),
      store: choice('abeno', { abeno: 0.5, takatsuki: 0.2 })
    })
    expect(evaluateWithStore(value, request, answers, DEFAULT_DETECTION_THRESHOLDS, 'abeno').status).toBe('register')
    expect(evaluateWithStore(value, request, answers, saved, 'abeno')).toMatchObject({
      status: 'held',
      reasons: ['store_unconfirmed']
    })
  })

  test('娘の下限は専用の設定を持たず、min(共通値, 0.3) になる', () => {
    expect(thresholdOf(DEFAULT_DETECTION_THRESHOLDS, 'character')).toBe(CHARACTER_DEFAULT_THRESHOLD)
    expect(thresholdOf({ ...DEFAULT_DETECTION_THRESHOLDS, fieldThreshold: 0.2 }, 'character')).toBe(0.2)
  })
})
