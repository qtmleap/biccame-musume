import { describe, expect, test } from 'bun:test'
import { describeAnswers } from './answer-view'
import { choice, thresholds } from './answer-view-test-fixtures'
import type { ClefAnswer } from './clef'
import { FIELD_THRESHOLD_KEYS, thresholdOf } from './detection'

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

  test('旧single_eventの監査回答は共通しきい値で表示を維持する', () => {
    const rows = rowsOf({ ...thresholds, fieldThreshold: 0.95 })
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
    // 8項目すべてが上書きを受ける。
    const all = Object.fromEntries(FIELD_THRESHOLD_KEYS.map((key, index) => [key, 0.5 + index / 100]))
    for (const row of describeAnswers(near, { ...thresholds, fieldThresholds: all })) {
      if (FIELD_THRESHOLD_KEYS.some((key) => key === row.key)) expect(row.threshold, row.key).toBe(all[row.key])
    }
  })
})
