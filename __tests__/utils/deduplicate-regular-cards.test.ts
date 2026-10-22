import { describe, expect, test } from 'bun:test'
import { deduplicateRegularCards } from '@biccame/shared/domain/deduplicate-regular-cards'
import type { Event } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'

const date = (iso: string) => dayjs(iso).toDate()

const makeEvent = (uuid: string, overrides: Partial<Event> = {}): Event => ({
  uuid,
  category: 'regular_card',
  title: uuid,
  stores: ['chofu'],
  characterIds: ['chofu'],
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
  test('同じ店舗でも別の娘（対象が明示されたもの）の通常名刺は両方残る', () => {
    const own = makeEvent('own')
    const other = makeEvent('other', { characterIds: ['seiseki'] })
    expect(uuids(deduplicateRegularCards([own, other]))).toEqual(['own', 'other'])
    expect(uuids(deduplicateRegularCards([other, own]))).toEqual(['other', 'own'])
  })

  test('同じ店舗で別々の娘が複数いても、娘ごとに1件ずつ残る', () => {
    const events = [
      makeEvent('own'),
      makeEvent('seiseki', { characterIds: ['seiseki'] }),
      makeEvent('own-old'),
      makeEvent('seiseki-old', { characterIds: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['own', 'seiseki'])
  })

  test('同じ店舗・同じ娘（同じ対象配列同士）は先頭だけ残る', () => {
    const events = [makeEvent('first'), makeEvent('second'), makeEvent('third')]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first'])
  })

  test('同じ店舗・同じ娘（同じ characterIds 同士）は先頭だけ残る', () => {
    const events = [
      makeEvent('first', { characterIds: ['seiseki'] }),
      makeEvent('second', { characterIds: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first'])
  })

  test('対象未判定と開催店舗の娘が明示された名刺を混同しない', () => {
    const unset = makeEvent('unset', { characterIds: [] })
    const same = makeEvent('same', { characterIds: ['chofu'] })
    expect(uuids(deduplicateRegularCards([unset, same]))).toEqual(['unset', 'same'])
    expect(uuids(deduplicateRegularCards([same, unset]))).toEqual(['same', 'unset'])
  })

  test('特殊値の characterIds（other / secret）も別の娘として扱う', () => {
    const events = [
      makeEvent('own'),
      makeEvent('other', { characterIds: ['other'] }),
      makeEvent('secret', { characterIds: ['secret'] }),
      makeEvent('other-again', { characterIds: ['other'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['own', 'other', 'secret'])
  })

  test('別の店舗の通常名刺は同じ娘でも別々に残る', () => {
    const events = [
      makeEvent('chofu', { stores: ['chofu'], characterIds: ['seiseki'] }),
      makeEvent('seiseki', { stores: ['seiseki'], characterIds: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['chofu', 'seiseki'])
  })

  test('複数開催店舗の集合が異なる名刺を、一部の共通店舗だけで除かない', () => {
    const events = [
      makeEvent('single', { stores: ['chofu'] }),
      makeEvent('multi', { stores: ['chofu', 'seiseki'] }),
      makeEvent('other-character', { stores: ['chofu', 'seiseki'], characterIds: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['single', 'multi', 'other-character'])
  })

  test('共同デザインと単独デザインは一部の対象が共通していても両方残る', () => {
    const single = makeEvent('single', { characterIds: ['funato'] })
    const collaboration = makeEvent('collaboration', { characterIds: ['funato', 'funabashi'] })
    expect(uuids(deduplicateRegularCards([single, collaboration]))).toEqual(['single', 'collaboration'])
    expect(uuids(deduplicateRegularCards([collaboration, single]))).toEqual(['collaboration', 'single'])
    expect(collaboration.characterIds).toEqual(['funato', 'funabashi'])
  })

  test('開催店舗・対象キャラの集合全体が同じなら配列順によらず重複になる', () => {
    const first = makeEvent('first', { stores: ['funabashi', 'abeno'], characterIds: ['funato', 'funabashi'] })
    const reordered = makeEvent('reordered', { stores: ['abeno', 'funabashi'], characterIds: ['funabashi', 'funato'] })
    expect(uuids(deduplicateRegularCards([first, reordered]))).toEqual(['first'])
    expect(first.stores).toEqual(['funabashi', 'abeno'])
    expect(first.characterIds).toEqual(['funato', 'funabashi'])
  })

  test('同名でも対象未判定の名刺同士は店舗から対象を推測して削除しない', () => {
    const events = [
      makeEvent('first', { title: '通常名刺', characterIds: [] }),
      makeEvent('second', { title: '通常名刺', characterIds: [] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first', 'second'])
  })

  test('店舗がない通常名刺は題で判定する', () => {
    const card = (uuid: string, title: string) => ({
      uuid,
      category: 'regular_card' as const,
      title,
      stores: [],
      characterIds: ['chofu']
    })
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
      makeEvent('regular-b', { characterIds: ['seiseki'] }),
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
