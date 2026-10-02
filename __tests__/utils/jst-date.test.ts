import { afterEach, expect, setSystemTime, test } from 'bun:test'
import { getJstDateKey, getJstYear, getNextJstMidnight } from '../../src/utils/jst-date'

afterEach(() => setSystemTime())

test('explicit instants determine JST date and year independently of the device clock', () => {
  setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
  expect(getJstDateKey('2026-12-31T14:59:59.999Z')).toBe('2026-12-31')
  expect(getJstYear('2026-12-31T14:59:59.999Z')).toBe(2026)
  expect(getJstDateKey('2026-12-31T15:00:00.000Z')).toBe('2027-01-01')
  expect(getJstYear('2026-12-31T15:00:00.000Z')).toBe(2027)
})

test('next JST midnight advances at the exact boundary', () => {
  setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
  expect(getNextJstMidnight('2026-12-31T14:59:59.999Z')).toBe('2026-12-31T15:00:00.000Z')
  expect(getNextJstMidnight('2026-12-31T15:00:00.000Z')).toBe('2027-01-01T15:00:00.000Z')
  expect(getNextJstMidnight('2024-02-28T15:00:00.000Z')).toBe('2024-02-29T15:00:00.000Z')
})
