import { expect, test } from 'bun:test'
import {
  eventPeriodText,
  omitRepeatedDates,
  rowPeriodText,
  socialDayWindow,
  socialPostKey,
  socialWeekWindow,
  sortSideEvents
} from '@biccame/shared/domain/social-post'
import type { SocialRow } from '@biccame/shared/social'
import {
  daily,
  endingToday,
  event,
  MONDAY,
  minute,
  required,
  sideRows,
  startingToday,
  uuid,
  weekly
} from '../fixtures/social-post-domain'

test('period text distinguishes an open end, a one day event and an actual end', () => {
  const open = event(1, { endDate: undefined })
  expect(eventPeriodText(open)).toBe('10/12(月) 〜 終了日未定')
  expect(rowPeriodText(open, 'starting')).toBe('終了日未定')
  expect(rowPeriodText(open, 'ending')).toBeNull()
  const oneDay = event(2, { endDate: '2026-10-12T23:59:59+09:00' })
  expect(eventPeriodText(oneDay)).toBe('10/12(月) のみ')
  expect(rowPeriodText(oneDay, 'starting')).toBe('1日のみ')
  expect(rowPeriodText(oneDay, 'ending')).toBe('1日のみ')
  const normal = event(3)
  expect(eventPeriodText(normal)).toBe('10/12(月) 〜 10/18(日)')
  expect(rowPeriodText(normal, 'starting')).toBe('10/18(日)まで')
  expect(rowPeriodText(normal, 'ending')).toBeNull()
  // endedAt は endDate より優先する。
  const early = event(4, { endedAt: '2026-10-14T12:00:00+09:00' })
  expect(eventPeriodText(early)).toBe('10/12(月) 〜 10/14(水)')
  expect(rowPeriodText(early, 'starting')).toBe('10/14(水)まで')
  const sameDayEnd = event(5, { endedAt: '2026-10-12T18:00:00+09:00' })
  expect(rowPeriodText(sameDayEnd, 'starting')).toBe('1日のみ')
  // 同じ暦日でも JST で日付を判定する（UTC では前日になる 0 時台）。
  const midnight = event(6, { startDate: '2026-10-12T00:30:00+09:00', endDate: '2026-10-12T23:30:00+09:00' })
  expect(eventPeriodText(midnight)).toBe('10/12(月) のみ')
})

test('daily rows carry the period of the side and no left date', () => {
  const snapshot = required(
    daily(
      [
        startingToday(1),
        startingToday(2, { endDate: '2026-10-12T23:59:59+09:00' }),
        startingToday(3, { endDate: undefined })
      ],
      [endingToday(4), endingToday(5, { startDate: '2026-10-12T00:00:00+09:00' })]
    )
  )
  const [starting] = sideRows(snapshot, 'starting')
  expect(starting.map((row) => row.period)).toEqual(['10/18(日)まで', '1日のみ', '終了日未定'])
  const [ending] = sideRows(snapshot, 'ending')
  expect(ending.map((row) => row.period)).toEqual([null, '1日のみ'])
  expect([...starting, ...ending].every((row) => row.date === null)).toBe(true)
})

test('weekly rows keep the date at the left edge and omit it on following rows with the same date', () => {
  const at = (day: number, n: number) => startingToday(n, { startDate: `2026-10-${day}T10:${minute(n)}:00+09:00` })
  const snapshot = required(
    weekly(
      [at(12, 1), at(12, 2), at(13, 3), at(13, 4), at(13, 5), at(14, 6)],
      [
        endingToday(7, { endDate: '2026-10-13T12:00:00+09:00' }),
        endingToday(8, { endDate: '2026-10-13T13:00:00+09:00' }),
        endingToday(9, { endDate: '2026-10-18T13:00:00+09:00' })
      ]
    )
  )
  const [first, second] = sideRows(snapshot, 'starting')
  // 日付の省略は画像ごとに判定する。2枚目の先頭行は同じ火曜でも日付を再表示する。
  expect(first.map((row) => row.date)).toEqual(['10/12(月)', null, '10/13(火)', null])
  expect(second.map((row) => row.date)).toEqual(['10/13(火)', '10/14(水)'])
  const [ending] = sideRows(snapshot, 'ending')
  expect(ending.map((row) => row.date)).toEqual(['10/13(火)', null, '10/18(日)'])
  // 開始側の期間は右側の行に残り、終了側は期間を出さない。
  expect(first[0].period).toBe('10/18(日)まで')
  expect(ending[0].period).toBeNull()
  expect(snapshot.images.map((image) => image.type === 'summary' && image.headline)).toEqual(
    Array.from({ length: 3 }, () => '10/12(月)〜10/18(日)')
  )
})

test('omitRepeatedDates keeps null dates and only drops equal neighbours', () => {
  const row = (date: string | null): SocialRow => ({
    eventIds: [crypto.randomUUID()],
    title: 't',
    stores: ['AKIBA店'],
    avatars: ['akiba'],
    target: null,
    period: null,
    date
  })
  expect(
    omitRepeatedDates([row('1/1(月)'), row('1/1(月)'), row('1/2(火)'), row('1/1(月)'), row(null)]).map((r) => r.date)
  ).toEqual(['1/1(月)', null, '1/2(火)', '1/1(月)', null])
})

test('ending rows are ordered by the actual end first and then by uuid', () => {
  const late = endingToday(1, { endDate: '2026-10-12T23:59:59+09:00', endedAt: '2026-10-12T10:00:00+09:00' })
  const mid = endingToday(2, { endDate: '2026-10-12T12:00:00+09:00' })
  const tie = endingToday(3, { endDate: '2026-10-12T12:00:00+09:00' })
  expect(sortSideEvents('ending', [tie, mid, late]).map((value) => value.uuid)).toEqual([uuid(1), uuid(2), uuid(3)])
  const starts = [startingToday(3), startingToday(2, { startDate: '2026-10-12T00:00:00+09:00' }), startingToday(1)]
  expect(sortSideEvents('starting', starts).map((value) => value.uuid)).toEqual([uuid(2), uuid(1), uuid(3)])
  const snapshot = required(daily([], [tie, mid, late]))
  expect(sideRows(snapshot, 'ending')[0].map((row) => row.eventIds[0])).toEqual([uuid(1), uuid(2), uuid(3)])
})

test('week and day windows follow JST midnight and the Monday boundary', () => {
  const week = socialWeekWindow(MONDAY)
  expect(week).toEqual({
    monday: '2026-10-12',
    sunday: '2026-10-18',
    headline: '10/12(月)〜10/18(日)',
    from: '2026-10-11T15:00:00.000Z',
    until: '2026-10-18T15:00:00.000Z'
  })
  // 日曜 23:59:59 (JST) は同じ週、月曜 0:00:00 (JST) ちょうどは次の週。
  expect(socialWeekWindow('2026-10-18T14:59:59Z').monday).toBe('2026-10-12')
  expect(socialWeekWindow('2026-10-18T15:00:00Z').monday).toBe('2026-10-19')
  expect(socialWeekWindow('2026-10-11T14:59:59Z').monday).toBe('2026-10-05')
  expect(socialDayWindow('2026-10-11T15:00:00Z').day).toBe('2026-10-12')
  expect(socialDayWindow('2026-10-11T14:59:59Z').day).toBe('2026-10-11')
  expect(socialPostKey('daily', MONDAY)).toBe('daily:2026-10-12')
  expect(socialPostKey('weekly', '2026-10-15T00:00:00Z')).toBe('weekly:2026-10-12')
})

test('weekly accepts the Monday midnight start and the Sunday 23:59 end and rejects the next Monday', () => {
  const start = (iso: string) => weekly([startingToday(1, { startDate: iso })], [])
  expect(start('2026-10-12T00:00:00+09:00')).not.toBeNull()
  expect(() => start('2026-10-19T00:00:00+09:00')).toThrow('outside')
  expect(() => start('2026-10-11T23:59:59+09:00')).toThrow('outside')
  const end = (iso: string, endedAt?: string) =>
    weekly([], [endingToday(1, { endDate: iso, ...(endedAt === undefined ? {} : { endedAt }) })])
  expect(end('2026-10-18T23:59:59+09:00')).not.toBeNull()
  expect(() => end('2026-10-19T00:00:00+09:00')).toThrow('outside')
  // endedAt が優先: 予定は週内でも実際の終了が前の週なら範囲外、その逆なら範囲内。
  expect(() => end('2026-10-14T12:00:00+09:00', '2026-10-11T12:00:00+09:00')).toThrow('outside')
  expect(end('2026-10-25T12:00:00+09:00', '2026-10-14T12:00:00+09:00')).not.toBeNull()
  // 終了日が不明なイベントは終了の一覧に入れない。
  expect(() => weekly([], [endingToday(1, { endDate: undefined })])).toThrow('outside')
})

test('daily rejects events whose day is not today', () => {
  expect(() => daily([startingToday(1, { startDate: '2026-10-13T00:00:00+09:00' })], [])).toThrow('outside')
  expect(() => daily([], [endingToday(1, { endDate: '2026-10-11T23:59:59+09:00' })])).toThrow('outside')
})
