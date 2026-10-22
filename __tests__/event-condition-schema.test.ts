import { describe, expect, test } from 'bun:test'
import { EventConditionSchema } from '@biccame/shared/schemas/event.dto'

const uuid = '11111111-1111-4111-a111-111111111111'

describe('入金条件の金額バリデーション', () => {
  test.each([0, 1000, 1000000])('整数の入金額 %s は受け付ける', (chargeAmount) => {
    expect(EventConditionSchema.safeParse({ uuid, type: 'charge', chargeAmount }).success).toBe(true)
  })

  test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('不正な入金額 %s を拒否する', (chargeAmount) => {
    expect(EventConditionSchema.safeParse({ uuid, type: 'charge', chargeAmount }).success).toBe(false)
  })

  test('未判定の入金額は省略可能のまま保持する', () => {
    expect(EventConditionSchema.safeParse({ uuid, type: 'charge' }).success).toBe(true)
  })

  test('入金条件へ購入額を混ぜず、別条件の入金額も拒否する', () => {
    expect(
      EventConditionSchema.safeParse({ uuid, type: 'charge', chargeAmount: 1000, purchaseAmount: 4000 }).success
    ).toBe(false)
    expect(EventConditionSchema.safeParse({ uuid, type: 'charge', purchaseAmount: 1000 }).success).toBe(false)
    for (const type of ['purchase', 'first_come', 'lottery', 'everyone']) {
      expect(EventConditionSchema.safeParse({ uuid, type, chargeAmount: 1000 }).success).toBe(false)
    }
  })

  test('従来の購入額と省略の契約を無関係に変更しない', () => {
    expect(EventConditionSchema.safeParse({ uuid, type: 'purchase' }).success).toBe(true)
    expect(EventConditionSchema.safeParse({ uuid, type: 'purchase', purchaseAmount: 1.5 }).success).toBe(true)
    expect(EventConditionSchema.safeParse({ uuid, type: 'purchase', purchaseAmount: 4000 }).success).toBe(true)
  })
})
