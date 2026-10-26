import { describe, expect, test } from 'bun:test'
import { describeAnswers } from './answer-view'
import { thresholds } from './answer-view-test-fixtures'
import {
  DEFAULT_DETECTION_THRESHOLDS,
  type DetectionThresholds,
  resolveFieldThresholds,
  thresholdOf
} from './detection'
import { choice, evaluateWithStore, post, requestWithAssociations, response } from './detection-test-fixtures'

// charge_amount（入金・チャージ額）も項目別のしきい値を持つ。未保存なら従来どおり共通値（fieldThreshold）で、既定の判定は変わらない。
const chargePost = post(
  'あべのたん周年記念デザインギフトカードを2026年11月3日から入金金額1,000円以上で先着100名に数量限定販売します'
)
const request = requestWithAssociations(chargePost)
const answersAt = (probability: number) =>
  response(request, {
    category: choice('other', { other: 0.99 }),
    condition: choice('charge_first_come', { charge_first_come: 0.99 }),
    charge_amount: choice('p1000', { p1000: probability, none: Math.min(0.2, 1 - probability) })
  })
const evaluate = (probability: number, setting: DetectionThresholds = DEFAULT_DETECTION_THRESHOLDS) =>
  evaluateWithStore(chargePost, request, answersAt(probability), setting)
const withCharge = (charge: number): DetectionThresholds => ({
  ...DEFAULT_DETECTION_THRESHOLDS,
  fieldThresholds: resolveFieldThresholds(0.9, { charge_amount: charge })
})

describe('charge_amount の項目別しきい値', () => {
  test('未保存のときは共通値（従来と同じ）。保存済みの他の項目の値には影響されない', () => {
    expect(thresholdOf(DEFAULT_DETECTION_THRESHOLDS, 'charge_amount')).toBe(0.9)
    expect(thresholdOf({ ...DEFAULT_DETECTION_THRESHOLDS, fieldThreshold: 0.6 }, 'charge_amount')).toBe(0.6)
    expect(
      thresholdOf(
        { ...DEFAULT_DETECTION_THRESHOLDS, fieldThresholds: { category: 0.1, purchase_amount: 0.1 } },
        'charge_amount'
      )
    ).toBe(0.9)
  })
  test('未保存の判定は従来どおり: 共通値 0.9 に届かない 0.8 は charge_amount_unconfirmed、0.95 は確定', () => {
    expect(evaluate(0.8).reasons).toContain('charge_amount_unconfirmed')
    expect(evaluate(0.95).reasons).not.toContain('charge_amount_unconfirmed')
    // 共通値を変えると追従する（従来と同じ）。
    expect(evaluate(0.8, { ...DEFAULT_DETECTION_THRESHOLDS, fieldThreshold: 0.75 }).reasons).not.toContain(
      'charge_amount_unconfirmed'
    )
    expect(evaluate(0.8, { ...DEFAULT_DETECTION_THRESHOLDS, fieldThresholds: {} })).toEqual(evaluate(0.8))
  })
  test('保存すると判定に反映される: 0.7 に下げれば 0.8 でも確定し、0.99 に上げれば 0.95 でも未確定', () => {
    expect(evaluate(0.8, withCharge(0.7)).reasons).not.toContain('charge_amount_unconfirmed')
    expect(evaluate(0.95, withCharge(0.99)).reasons).toContain('charge_amount_unconfirmed')
    // 保存した値が共通値より優先する（共通値を上げても保存値のまま）。
    expect(evaluate(0.8, { ...withCharge(0.7), fieldThreshold: 0.99 }).reasons).not.toContain(
      'charge_amount_unconfirmed'
    )
  })
  test('回答表の行も保存した値（thresholdOf の値）で出る', () => {
    const rowOf = (setting: DetectionThresholds) => {
      const row = describeAnswers(answersAt(0.8).answers, setting).find((entry) => entry.key === 'charge_amount')
      if (row === undefined) throw new Error('Missing charge_amount row')
      return row
    }
    expect(rowOf(thresholds)).toMatchObject({ threshold: 0.9, confirmed: false })
    expect(rowOf(withCharge(0.7))).toMatchObject({ threshold: 0.7, confirmed: true })
    expect(rowOf(withCharge(0.7)).threshold).toBe(thresholdOf(withCharge(0.7), 'charge_amount'))
  })
})
