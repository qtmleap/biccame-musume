import { afterEach, expect, setSystemTime, test } from 'bun:test'
import dayjs from 'dayjs'
import { type EventListPayload, transform } from '../../src/services/event-service'
import { calculateEventStatus } from '../../src/utils/event-status'

const fixture: EventListPayload = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  category: 'ackey',
  title: '最終日のイベント',
  startDate: dayjs('2026-12-01T00:00:00.000Z').toDate(),
  endDate: dayjs('2026-12-31T00:00:00.000Z').toDate(),
  endedAt: null,
  isVerified: true,
  isPreliminary: false,
  limitedQuantity: null,
  groupId: null,
  characterId: null,
  createdAt: dayjs('2026-12-01').toDate(),
  updatedAt: dayjs('2026-12-01').toDate(),
  conditions: [],
  stores: [{ storeKey: 'sapporo' }]
}

afterEach(() => setSystemTime())

test('last_day_becomes_ended_after_midnight on the server', () => {
  setSystemTime(new Date('2026-12-31T14:59:59.999Z'))
  expect(transform(fixture).status).toBe('last_day')
  setSystemTime(new Date('2026-12-31T15:00:00.000Z'))
  expect(transform(fixture).status).toBe('ended')
})

test.each([
  ['2026-12-29T15:00:00.000Z', 'upcoming', 1],
  ['2026-12-30T15:00:00.000Z', 'ongoing', 2],
  ['2027-01-02T14:59:59.999Z', 'last_day', 0],
  ['2027-01-02T15:00:00.000Z', 'ended', 0]
] as const)('shared status uses JST calendar days at %s', (nowIso, status, daysUntil) => {
  expect(
    calculateEventStatus(
      {
        startDate: '2026-12-31T00:00:00+09:00',
        endDate: '2027-01-02T00:00:00+09:00'
      },
      nowIso
    )
  ).toEqual({ status, daysUntil })
})

test('shared status preserves open-ended and explicitly ended events', () => {
  const event = { startDate: '2026-12-31T00:00:00+09:00' }
  expect(calculateEventStatus(event, '2027-01-01T15:00:00.000Z')).toEqual({ status: 'ongoing', daysUntil: 0 })
  expect(calculateEventStatus({ ...event, endedAt: '2026-12-31T12:00:00+09:00' }, '2027-01-01T15:00:00.000Z')).toEqual({
    status: 'ended',
    daysUntil: 0
  })
})
