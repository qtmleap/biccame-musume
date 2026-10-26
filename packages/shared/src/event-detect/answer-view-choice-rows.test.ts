import { describe, expect, test } from 'bun:test'
import { describeAnswers } from './answer-view'
import { choice, thresholds } from './answer-view-test-fixtures'
import { CHARACTER_CONFIRM_KEY, STORE_CONFIRM_KEY } from './associations'
import type { ClefAnswer } from './clef'
import { type DetectionThresholds, resolveFieldThresholds } from './detection'

// 店舗・娘の choice 行: 対応する確認の行が回答にあれば、しきい値と判定は「—」（null）にする。判定は直下の確認の行が担う
// （確認が確定なら choice が確定かどうかはどうでもいい）。確認の行が無い保存データ（v15 以前）は、しきい値 70% と確定・未確定を出す。
const yes = (probability: number): ClefAnswer => ({ type: 'noul', noul: probability })
const rowOf = (rows: ReturnType<typeof describeAnswers>, key: string) => {
  const row = rows.find((entry) => entry.key === key)
  if (row === undefined) throw new Error(`Missing row ${key}`)
  return row
}

describe('確認の行がある choice 行は、しきい値と判定を null（画面は —）にする', () => {
  const answers: Record<string, ClefAnswer> = {
    store: choice('shinyoko', { shinyoko: 0.805, akiba: 0.05 }),
    [STORE_CONFIRM_KEY]: yes(0.976),
    character: choice('shinyoko', { shinyoko: 0.789, other: 0.038 }),
    [CHARACTER_CONFIRM_KEY]: yes(0.9)
  }
  test('確率・回答・次点は今のまま出し、しきい値と判定だけが null', () => {
    const rows = describeAnswers(answers, thresholds)
    expect(rowOf(rows, 'store')).toMatchObject({
      answer: '新横浜店',
      probability: 0.805,
      threshold: null,
      confirmed: null
    })
    expect(rowOf(rows, 'store').alternatives).toEqual([{ answer: 'AKIBA店', probability: 0.05 }])
    expect(rowOf(rows, 'character')).toMatchObject({ probability: 0.789, threshold: null, confirmed: null })
  })
  test('確認の行はこれまでどおり、しきい値 70% と確定・未確定を出す', () => {
    const rows = describeAnswers(answers, thresholds)
    expect(rowOf(rows, STORE_CONFIRM_KEY)).toMatchObject({ threshold: 0.7, confirmed: true })
    expect(rowOf(rows, CHARACTER_CONFIRM_KEY)).toMatchObject({ threshold: 0.7, confirmed: true })
  })
  test('確認が低くても、choice 行は null のまま（判定は確認の行が示す）', () => {
    const low = describeAnswers(
      { ...answers, [STORE_CONFIRM_KEY]: yes(0.2), [CHARACTER_CONFIRM_KEY]: yes(0.2) },
      thresholds
    )
    expect(rowOf(low, 'store')).toMatchObject({ threshold: null, confirmed: null })
    expect(rowOf(low, 'character')).toMatchObject({ threshold: null, confirmed: null })
    expect(rowOf(low, STORE_CONFIRM_KEY)).toMatchObject({ confirmed: false })
  })
  test('店舗の確認だけがあるなら、店舗の choice 行だけが null。娘の choice 行はしきい値と判定を出す', () => {
    const { [CHARACTER_CONFIRM_KEY]: _character, ...storeOnly } = answers
    const rows = describeAnswers(storeOnly, thresholds)
    expect(rowOf(rows, 'store')).toMatchObject({ threshold: null, confirmed: null })
    expect(rowOf(rows, 'character')).toMatchObject({ threshold: 0.7, confirmed: true })
  })
})

describe('確認の行が無い choice 行（v15 以前の保存データ）は、しきい値 70% と確定・未確定を従来どおり出す', () => {
  test('70% 以上は確定、未満は未確定。ちょうど 70% は確定', () => {
    const at = (probability: number) =>
      describeAnswers(
        {
          store: choice('shinyoko', { shinyoko: probability }),
          character: choice('shinyoko', { shinyoko: probability })
        },
        thresholds
      )
    for (const row of ['store', 'character']) {
      expect(rowOf(at(0.805), row)).toMatchObject({ threshold: 0.7, confirmed: true })
      expect(rowOf(at(0.7), row)).toMatchObject({ threshold: 0.7, confirmed: true })
      expect(rowOf(at(0.699), row)).toMatchObject({ threshold: 0.7, confirmed: false })
      expect(rowOf(at(0.49), row)).toMatchObject({ threshold: 0.7, confirmed: false })
    }
  })
  test('保存した値（store: 0.9）があれば、しきい値はその値になる', () => {
    const saved: DetectionThresholds = { ...thresholds, fieldThresholds: resolveFieldThresholds(0.9, { store: 0.9 }) }
    const rows = describeAnswers({ store: choice('shinyoko', { shinyoko: 0.85 }) }, saved)
    expect(rowOf(rows, 'store')).toMatchObject({ threshold: 0.9, confirmed: false })
  })
})
