import { describe, expect, test } from 'bun:test'
import { withoutNewEventOnlyReasons } from './detection-reasons'
import { matrixCells, outcomeOf } from './detection-status-matrix'
import { BASELINE_OUTCOMES } from './detection-status-matrix-baseline'

// 継続・終了の投稿から新規登録向けの理由を除いても、登録の可否（status）は変わらない。
// 基準値は、理由の付け方を変える前（5d49e820）の evaluateDetection の結果。status と、理由の並びまで記録している。

const parse = (outcome: string) => {
  const separator = outcome.indexOf(':')
  const reasons = outcome.slice(separator + 1)
  return { status: outcome.slice(0, separator), reasons: reasons === '' ? [] : reasons.split(',') }
}
const cells = matrixCells()
const existing = cells.filter((cell) => /\|(ongoing|end)\|/.test(cell.key))
const others = cells.filter((cell) => !/\|(ongoing|end)\|/.test(cell.key))

describe('状態 × 日付 × 条件の性質テスト', () => {
  test('基準値と組み合わせが過不足なく対応する', () => {
    expect(cells.map((cell) => cell.key).sort()).toEqual(Object.keys(BASELINE_OUTCOMES).sort())
    expect(existing.length).toBeGreaterThan(0)
    expect(others.length).toBeGreaterThan(0)
  })

  test('登録の可否（status）は全ての組み合わせで修正前と同じ', () => {
    for (const cell of cells)
      expect(parse(outcomeOf(cell)).status, cell.key).toBe(parse(BASELINE_OUTCOMES[cell.key]).status)
  })

  test('登録に進むのは告知・開始だけ（継続・終了・状態なし・状態が確定しない投稿は必ず保留）', () => {
    const registered = cells.filter((cell) => parse(outcomeOf(cell)).status === 'register')
    expect(registered.length).toBeGreaterThan(0)
    for (const cell of registered) expect(cell.key, cell.key).toMatch(/\|(announce|start)\|/)
  })

  test('告知・開始・状態なし・状態が確定しない投稿は、理由も並びまで修正前と同じ', () => {
    for (const cell of others) expect(outcomeOf(cell), cell.key).toBe(BASELINE_OUTCOMES[cell.key])
  })

  test('継続・終了の投稿は、修正前の理由から新規登録向けの理由だけを除いた並びになる', () => {
    for (const cell of existing)
      expect(parse(outcomeOf(cell)).reasons, cell.key).toEqual(
        withoutNewEventOnlyReasons(parse(BASELINE_OUTCOMES[cell.key]).reasons)
      )
  })

  test('継続・終了の投稿に、新規登録向けの理由は残らず、状態の理由は必ず残る', () => {
    const forbidden = [
      'start_date_unspecified',
      'start_date_unconfirmed',
      'end_date_unconfirmed',
      'invalid_date_range',
      'distribution_condition_unspecified',
      'distribution_condition_unconfirmed',
      'purchase_amount_unconfirmed',
      'charge_amount_unconfirmed',
      'unmodeled_distribution_condition'
    ]
    for (const cell of existing) {
      const { reasons } = parse(outcomeOf(cell))
      for (const reason of forbidden) expect(reasons, `${cell.key} ${reason}`).not.toContain(reason)
      expect(reasons, cell.key).toContain(/\|ongoing\|/.test(cell.key) ? 'existing_event_update' : 'event_ended')
    }
  })

  test('修正前は継続・終了にも新規登録向けの理由が付いていた（この組み合わせが修正の対象を含む）', () => {
    const removed = new Set(
      existing.flatMap((cell) => {
        const before = parse(BASELINE_OUTCOMES[cell.key]).reasons
        return before.filter((reason) => !parse(outcomeOf(cell)).reasons.includes(reason))
      })
    )
    expect([...removed].sort()).toEqual(
      [
        'charge_amount_unconfirmed',
        'distribution_condition_unconfirmed',
        'distribution_condition_unspecified',
        'end_date_unconfirmed',
        'invalid_date_range',
        'purchase_amount_unconfirmed',
        'start_date_unconfirmed',
        'start_date_unspecified',
        'unmodeled_distribution_condition'
      ].sort()
    )
  })
})
