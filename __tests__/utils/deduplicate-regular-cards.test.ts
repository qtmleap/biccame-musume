import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import type { Event } from '../../workers/app/src/schemas/event.dto'
import { deduplicateRegularCards } from '../../workers/app/src/utils/deduplicate-regular-cards'

const date = (iso: string) => dayjs(iso).toDate()

const makeEvent = (uuid: string, overrides: Partial<Event> = {}): Event => ({
  uuid,
  category: 'regular_card',
  title: uuid,
  stores: ['chofu'],
  startDate: date('2026-10-04T00:00:00+09:00'),
  endDate: date('2027-03-31T00:00:00+09:00'),
  conditions: [],
  isVerified: true,
  isPreliminary: false,
  status: 'ongoing',
  daysUntil: 0,
  interestedCount: 0,
  completedCount: 0,
  createdAt: date('2026-10-01T00:00:00+09:00'),
  updatedAt: date('2026-10-01T00:00:00+09:00'),
  ...overrides
})

const uuids = (events: { uuid: string }[]) => events.map((e) => e.uuid)

describe('通常名刺の重複除去', () => {
  test('同じ店舗でも別の娘（characterId あり）の通常名刺は両方残る', () => {
    const own = makeEvent('own')
    const other = makeEvent('other', { characterId: 'seiseki' })
    expect(uuids(deduplicateRegularCards([own, other]))).toEqual(['own', 'other'])
    expect(uuids(deduplicateRegularCards([other, own]))).toEqual(['other', 'own'])
  })

  test('同じ店舗で別々の娘が複数いても、娘ごとに1件ずつ残る', () => {
    const events = [
      makeEvent('own'),
      makeEvent('seiseki', { characterId: 'seiseki' }),
      makeEvent('own-old'),
      makeEvent('seiseki-old', { characterId: 'seiseki' })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['own', 'seiseki'])
  })

  test('同じ店舗・同じ娘（characterId なし同士）は先頭だけ残る', () => {
    const events = [makeEvent('first'), makeEvent('second'), makeEvent('third')]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first'])
  })

  test('同じ店舗・同じ娘（同じ characterId 同士）は先頭だけ残る', () => {
    const events = [makeEvent('first', { characterId: 'seiseki' }), makeEvent('second', { characterId: 'seiseki' })]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first'])
  })

  test('characterId が店舗キーと同じ値のものと characterId なしは同じ娘として扱う', () => {
    const unset = makeEvent('unset')
    const same = makeEvent('same', { characterId: 'chofu' })
    expect(uuids(deduplicateRegularCards([unset, same]))).toEqual(['unset'])
    expect(uuids(deduplicateRegularCards([same, unset]))).toEqual(['same'])
  })

  test('特殊値の characterId（other / secret）も別の娘として扱う', () => {
    const events = [
      makeEvent('own'),
      makeEvent('other', { characterId: 'other' }),
      makeEvent('secret', { characterId: 'secret' }),
      makeEvent('other-again', { characterId: 'other' })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['own', 'other', 'secret'])
  })

  test('別の店舗の通常名刺は同じ娘でも別々に残る', () => {
    const events = [
      makeEvent('chofu', { stores: ['chofu'], characterId: 'seiseki' }),
      makeEvent('seiseki', { stores: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['chofu', 'seiseki'])
  })

  test('複数店舗のイベントは、いずれかの店舗・娘が既出なら除かれる', () => {
    const events = [
      makeEvent('single', { stores: ['chofu'] }),
      makeEvent('multi', { stores: ['chofu', 'seiseki'] }),
      makeEvent('other-character', { stores: ['chofu', 'seiseki'], characterId: 'seiseki' })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['single', 'other-character'])
  })

  test('店舗がない通常名刺は題で判定する', () => {
    const card = (uuid: string, title: string) => ({ uuid, category: 'regular_card' as const, title, stores: [] })
    const events = [card('a1', '共通名刺'), card('a2', '共通名刺'), card('b1', '別の名刺')]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['a1', 'b1'])
  })

  test('通常名刺以外のカテゴリは同じ店舗・同じ娘でも除去しない', () => {
    const events = [
      makeEvent('limited-1', { category: 'limited_card' }),
      makeEvent('limited-2', { category: 'limited_card' }),
      makeEvent('ackey-1', { category: 'ackey' }),
      makeEvent('ackey-2', { category: 'ackey' }),
      makeEvent('acsta-1', { category: 'acsta' }),
      makeEvent('acsta-2', { category: 'acsta' }),
      makeEvent('other-1', { category: 'other' }),
      makeEvent('other-2', { category: 'other' })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(uuids(events))
  })

  test('通常名刺以外が間に挟まっても、残る通常名刺の元の順序を保つ', () => {
    const events = [
      makeEvent('regular-a'),
      makeEvent('limited', { category: 'limited_card' }),
      makeEvent('regular-dup'),
      makeEvent('regular-b', { characterId: 'seiseki' }),
      makeEvent('ackey', { category: 'ackey' })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['regular-a', 'limited', 'regular-b', 'ackey'])
  })

  test('空の一覧は空のまま返し、入力は書き換えない', () => {
    expect(deduplicateRegularCards([])).toEqual([])
    const events = [makeEvent('first'), makeEvent('second')]
    deduplicateRegularCards(events)
    expect(uuids(events)).toEqual(['first', 'second'])
  })
})
