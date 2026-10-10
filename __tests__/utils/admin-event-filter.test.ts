import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import type { Event } from '../../workers/app/src/schemas/event.dto'
import { type AdminEventFilter, filterAdminEvents, getListStatus } from '../../workers/app/src/utils/admin-event-filter'

const now = dayjs('2026-06-15T12:00:00+09:00')
const date = (iso: string) => dayjs(iso).toDate()

const makeEvent = (uuid: string, overrides: Partial<Event> = {}): Event => ({
  uuid,
  category: 'limited_card',
  title: uuid,
  stores: ['akiba'],
  startDate: date('2026-06-01T00:00:00+09:00'),
  endDate: date('2026-06-30T00:00:00+09:00'),
  conditions: [],
  isVerified: true,
  isPreliminary: false,
  status: 'ongoing',
  daysUntil: 0,
  interestedCount: 0,
  completedCount: 0,
  createdAt: date('2026-05-01T00:00:00+09:00'),
  updatedAt: date('2026-05-01T00:00:00+09:00'),
  ...overrides
})

const allStatuses = { upcoming: true, ongoing: true, ended: true }
const baseFilter: AdminEventFilter = { verification: 'all', category: 'limited_card', store: null, status: allStatuses }
const uuids = (events: Event[]) => events.map((e) => e.uuid)

describe('getListStatus', () => {
  test('終了日時 (endedAt) があれば終了', () => {
    expect(getListStatus(makeEvent('a', { endedAt: date('2026-06-10T00:00:00+09:00') }), now)).toBe('ended')
  })

  test('終了日を過ぎていれば終了', () => {
    expect(getListStatus(makeEvent('a', { endDate: date('2026-06-14T00:00:00+09:00') }), now)).toBe('ended')
  })

  test('開始前は upcoming', () => {
    expect(getListStatus(makeEvent('a', { startDate: date('2026-06-20T00:00:00+09:00') }), now)).toBe('upcoming')
  })

  test('期間内と終了日なしは ongoing', () => {
    expect(getListStatus(makeEvent('a'), now)).toBe('ongoing')
    expect(getListStatus(makeEvent('b', { endDate: undefined }), now)).toBe('ongoing')
  })
})

describe('filterAdminEvents — 確認状態', () => {
  const events = [makeEvent('verified'), makeEvent('unverified', { isVerified: false })]

  test('all は確認済みも未確認も残す', () => {
    expect(uuids(filterAdminEvents(events, baseFilter, now))).toEqual(['verified', 'unverified'])
  })

  test('verified は確認済みだけ', () => {
    expect(uuids(filterAdminEvents(events, { ...baseFilter, verification: 'verified' }, now))).toEqual(['verified'])
  })

  test('unverified は未確認だけ', () => {
    expect(uuids(filterAdminEvents(events, { ...baseFilter, verification: 'unverified' }, now))).toEqual(['unverified'])
  })

  test('元の並びを変えない', () => {
    const reversed = [...events].reverse()
    expect(uuids(filterAdminEvents(reversed, baseFilter, now))).toEqual(['unverified', 'verified'])
  })
})

describe('filterAdminEvents — 確認状態 x カテゴリ x 店舗 x ステータスの AND', () => {
  const events = [
    makeEvent('v-limited-akiba-ongoing'),
    makeEvent('u-limited-akiba-ongoing', { isVerified: false }),
    makeEvent('u-limited-abeno-ongoing', { isVerified: false, stores: ['abeno'] }),
    makeEvent('u-limited-akiba-ended', { isVerified: false, endedAt: date('2026-06-10T00:00:00+09:00') }),
    makeEvent('u-limited-akiba-upcoming', { isVerified: false, startDate: date('2026-06-20T00:00:00+09:00') }),
    makeEvent('u-ackey-akiba-ongoing', { isVerified: false, category: 'ackey' }),
    makeEvent('u-acsta-akiba-ongoing', { isVerified: false, category: 'acsta' }),
    makeEvent('u-limited-multi', { isVerified: false, stores: ['abeno', 'akiba'] })
  ]
  const unverified: AdminEventFilter = { ...baseFilter, verification: 'unverified' }

  test('未確認だけでカテゴリを絞る', () => {
    expect(uuids(filterAdminEvents(events, unverified, now))).toEqual([
      'u-limited-akiba-ongoing',
      'u-limited-abeno-ongoing',
      'u-limited-akiba-ended',
      'u-limited-akiba-upcoming',
      'u-limited-multi'
    ])
    expect(uuids(filterAdminEvents(events, { ...unverified, category: 'ackey' }, now))).toEqual([
      'u-ackey-akiba-ongoing'
    ])
  })

  test('アクスタのタブにはアクスタだけが並ぶ', () => {
    expect(uuids(filterAdminEvents(events, { ...unverified, category: 'acsta' }, now))).toEqual([
      'u-acsta-akiba-ongoing'
    ])
  })

  test('店舗は複数店舗のイベントにも一致する', () => {
    expect(uuids(filterAdminEvents(events, { ...unverified, store: 'abeno' }, now))).toEqual([
      'u-limited-abeno-ongoing',
      'u-limited-multi'
    ])
  })

  test('ステータスのチェックを外すとその状態のイベントが消える', () => {
    const withoutEnded = { ...unverified, store: 'akiba', status: { ...allStatuses, ended: false } }
    expect(uuids(filterAdminEvents(events, withoutEnded, now))).toEqual([
      'u-limited-akiba-ongoing',
      'u-limited-akiba-upcoming',
      'u-limited-multi'
    ])
    const onlyUpcoming = { ...unverified, status: { upcoming: true, ongoing: false, ended: false } }
    expect(uuids(filterAdminEvents(events, onlyUpcoming, now))).toEqual(['u-limited-akiba-upcoming'])
  })

  test('確認済みと条件を重ねると未確認は混ざらない', () => {
    const verifiedAkiba = { ...baseFilter, verification: 'verified', store: 'akiba' } as const
    expect(uuids(filterAdminEvents(events, verifiedAkiba, now))).toEqual(['v-limited-akiba-ongoing'])
  })

  test('どれにも当てはまらなければ空', () => {
    expect(filterAdminEvents(events, { ...unverified, store: 'sapporo' }, now)).toEqual([])
  })
})
