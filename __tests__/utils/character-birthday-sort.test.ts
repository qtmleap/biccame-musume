import { afterEach, expect, setSystemTime, test } from 'bun:test'
import dayjs from 'dayjs'
import { getDaysFromBirthday } from '../../src/utils/character'

afterEach(() => setSystemTime())

test('past_birthday_is_next_year', () => {
  const nowIso = '2026-10-02T03:00:00.000Z'
  setSystemTime(dayjs(nowIso).toDate())
  expect(getDaysFromBirthday('2016-10-01', nowIso)).toBe(364)
  expect(getDaysFromBirthday('2016-10-03', nowIso)).toBe(1)
})

test('birthday_today_is_zero', () => {
  expect(getDaysFromBirthday('2016-10-02', '2026-10-02T03:00:00.000Z')).toBe(0)
})

test('leap_day_policy_is_feb28', () => {
  expect(getDaysFromBirthday('2024-02-29', '2026-02-27T15:00:00.000Z')).toBe(0)
  expect(getDaysFromBirthday('2024-02-29', '2026-02-28T15:00:00.000Z')).toBe(364)
  expect(getDaysFromBirthday('2024-02-29', '2027-02-28T15:00:00.000Z')).toBe(365)
  expect(getDaysFromBirthday('2024-02-29', '2028-02-27T15:00:00.000Z')).toBe(1)
  expect(getDaysFromBirthday('2024-02-29', '2028-02-28T15:00:00.000Z')).toBe(0)
})

test('JST midnight changes the countdown independently of the device clock', () => {
  setSystemTime(dayjs('2020-01-01T00:00:00.000Z').toDate())
  expect(getDaysFromBirthday('2016-10-02', '2026-10-01T14:59:59.999Z')).toBe(1)
  expect(getDaysFromBirthday('2016-10-02', '2026-10-01T15:00:00.000Z')).toBe(0)
})

test('JST year rollover selects the next occurrence', () => {
  expect(getDaysFromBirthday('2016-01-01', '2026-12-31T14:59:59.999Z')).toBe(1)
  expect(getDaysFromBirthday('2016-01-01', '2026-12-31T15:00:00.000Z')).toBe(0)
  expect(getDaysFromBirthday('2016-12-31', '2026-12-31T15:00:00.000Z')).toBe(364)
})

test('invalid and unset birthdays retain the last-sort sentinel', () => {
  for (const birthday of [undefined, null, '', 'not-a-date', '2026-02-30', '2026-13-01']) {
    expect(getDaysFromBirthday(birthday, '2026-10-02T03:00:00.000Z')).toBe(Number.MAX_SAFE_INTEGER)
  }
})

test.each(['2026-2-30', '2026/02/30', '2026-02-30T00:00:00'])(
  'noncanonical impossible birthday %s retains the last-sort sentinel',
  (birthday) => {
    expect(getDaysFromBirthday(birthday, '2026-10-02T03:00:00.000Z')).toBe(Number.MAX_SAFE_INTEGER)
  }
)

test('valid year-first birthday formats remain supported', () => {
  for (const birthday of [
    '2016-10-2',
    '2016/10/02',
    '2016/10/2',
    '2016-10-02T00:00:00',
    '2016-10-02T12:00:00.123Z',
    '2016-10-02T12:00:00+00:00'
  ]) {
    expect(getDaysFromBirthday(birthday, '2026-10-02T03:00:00.000Z')).toBe(0)
  }
})

test('unsupported date formats and invalid timestamp clock fields receive the sentinel', () => {
  for (const birthday of ['10/02/2016', 'October 2, 2016', '2016-10-02T25:00:00', '2016-10-02T00:60:00']) {
    expect(getDaysFromBirthday(birthday, '2026-10-02T03:00:00.000Z')).toBe(Number.MAX_SAFE_INTEGER)
  }
})

test('existing callers can omit the explicit instant and still use JST', () => {
  setSystemTime(dayjs('2026-10-01T15:00:00.000Z').toDate())
  expect(getDaysFromBirthday('2016-10-02')).toBe(0)
  expect(getDaysFromBirthday('2016-10-01')).toBe(364)
})
