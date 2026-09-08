import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { getJSTDateKey, getJSTYear, getNextJSTDate, getNextJSTDateKey } from '../../src/utils/vote'

afterEach(() => {
  setSystemTime()
})

describe('JST の日付境界', () => {
  test('UTC 14:59 はまだ当日 (JST 23:59)', () => {
    setSystemTime(new Date('2026-01-01T14:59:59Z'))
    expect(getJSTDateKey()).toBe('2026-01-01')
  })

  test('UTC 15:00 で翌日に切り替わる (JST 00:00)', () => {
    setSystemTime(new Date('2026-01-01T15:00:00Z'))
    expect(getJSTDateKey()).toBe('2026-01-02')
  })

  test('UTC 0 時では日付が変わらない', () => {
    setSystemTime(new Date('2026-01-02T00:00:00Z'))
    expect(getJSTDateKey()).toBe('2026-01-02')
  })
})

describe('JST の年', () => {
  test('元日 UTC 0 時は JST では既に新年', () => {
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(getJSTYear()).toBe(2026)
  })

  test('大晦日 UTC 15:00 は JST では新年', () => {
    setSystemTime(new Date('2025-12-31T15:00:00Z'))
    expect(getJSTYear()).toBe(2026)
  })

  test('大晦日 UTC 14:59 はまだ前年', () => {
    setSystemTime(new Date('2025-12-31T14:59:59Z'))
    expect(getJSTYear()).toBe(2025)
  })
})

describe('次回投票日', () => {
  test('getNextJSTDateKey は JST の翌日を返す', () => {
    setSystemTime(new Date('2026-01-01T14:59:59Z'))
    expect(getNextJSTDateKey()).toBe('2026-01-02')
  })

  test('getNextJSTDate は JST 翌日 0 時の ISO を返す', () => {
    setSystemTime(new Date('2026-01-01T14:59:59Z'))
    // JST 2026-01-02 00:00 = UTC 2026-01-01 15:00
    expect(getNextJSTDate()).toBe('2026-01-01T15:00:00.000Z')
  })
})
