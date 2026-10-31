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
      makeEvent('own', { characterIds: ['funato'] }),
      makeEvent('seiseki', { characterIds: ['seiseki'] }),
      makeEvent('own-old', { characterIds: ['funato'] }),
      makeEvent('seiseki-old', { characterIds: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['own', 'seiseki'])
  })

  test('同じ店舗・同じ娘（同じ対象配列同士）は先頭だけ残る', () => {
    const events = [
      makeEvent('first', { characterIds: ['funato'] }),
      makeEvent('second', { characterIds: ['funato'] }),
      makeEvent('third', { characterIds: ['funato'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first'])
  })

  test('同じ店舗・同じ娘（同じ characterIds 同士）は先頭だけ残る', () => {
    const events = [
      makeEvent('first', { characterIds: ['seiseki'] }),
      makeEvent('second', { characterIds: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first'])
  })

  test('対象未判定の名刺は、同じ店舗に何件あっても全件保持する', () => {
    const events = [makeEvent('a', { characterIds: [] }), makeEvent('b', { characterIds: [] })]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['a', 'b'])
  })

  test('開催店舗の娘そのもの（既定）の名刺は、対象未判定と同じく全件保持する', () => {
    const unset = makeEvent('unset', { characterIds: [] })
    const same = makeEvent('same', { characterIds: ['chofu'] })
    const sameAgain = makeEvent('same-again', { characterIds: ['chofu'] })
    expect(uuids(deduplicateRegularCards([unset, same, sameAgain]))).toEqual(['unset', 'same', 'same-again'])
    expect(uuids(deduplicateRegularCards([same, unset, sameAgain]))).toEqual(['same', 'unset', 'same-again'])
  })

  test('開催店舗と別の娘を明示した名刺は、対象未判定・既定の名刺とは別に、先頭だけ残る', () => {
    const events = [
      makeEvent('unset', { characterIds: [] }),
      makeEvent('same', { characterIds: ['chofu'] }),
      makeEvent('explicit', { characterIds: ['seiseki'] }),
      makeEvent('explicit-again', { characterIds: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['unset', 'same', 'explicit'])
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
    const card = (
      uuid: string,
      title: string
    ): Pick<Event, 'uuid' | 'category' | 'title' | 'stores' | 'characterIds'> => ({
      uuid,
      category: 'regular_card',
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
      makeEvent('regular-a', { characterIds: ['funato'] }),
      makeEvent('limited', { category: 'limited_card' }),
      makeEvent('regular-dup', { characterIds: ['funato'] }),
      makeEvent('regular-b', { characterIds: ['seiseki'] }),
      makeEvent('ackey', { category: 'ackey' })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['regular-a', 'limited', 'regular-b', 'ackey'])
  })

  test('同じ店舗で、どちらも自店舗の娘だけを持つ通常名刺は、2件とも残る', () => {
    const events = [makeEvent('first', { characterIds: ['chofu'] }), makeEvent('second', { characterIds: ['chofu'] })]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first', 'second'])
  })

  test('娘が空の通常名刺は、2件とも残る（変わらない）', () => {
    const events = [makeEvent('first', { characterIds: [] }), makeEvent('second', { characterIds: [] })]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first', 'second'])
  })

  test('自店舗と別の娘を明示した同じ店舗の2件は、先頭だけ残る（変わらない）', () => {
    const events = [
      makeEvent('first', { characterIds: ['seiseki'] }),
      makeEvent('second', { characterIds: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first'])
  })

  test('自店舗の娘に別の娘を足した共同デザインは、並び順に依らず同じ名刺として先頭だけ残る', () => {
    const events = [
      makeEvent('first', { characterIds: ['chofu', 'seiseki'] }),
      makeEvent('second', { characterIds: ['seiseki', 'chofu'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first'])
  })

  test('自店舗の娘に別の娘を足した共同デザインは、別の娘だけの名刺と別の名刺として両方残る', () => {
    const events = [
      makeEvent('mixed', { characterIds: ['chofu', 'seiseki'] }),
      makeEvent('only-other', { characterIds: ['seiseki'] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['mixed', 'only-other'])
    expect(uuids(deduplicateRegularCards([...events].reverse()))).toEqual(['only-other', 'mixed'])
  })

  test('複数店舗で、各開催店舗の娘だけを持つ名刺は、すべて保持する', () => {
    const events = [
      makeEvent('first', { stores: ['chofu', 'seiseki'], characterIds: ['chofu', 'seiseki'] }),
      makeEvent('second', { stores: ['chofu', 'seiseki'], characterIds: [] })
    ]
    expect(uuids(deduplicateRegularCards(events))).toEqual(['first', 'second'])
  })

  test('バックフィルの前後（娘が空のイベントだけ開催店舗の娘が入る）で、同じ入力から同じ結果になる', () => {
    const inputs: { id: string; stores: Event['stores']; explicit: Event['characterIds'] }[] = [
      { id: 'a1', stores: ['chofu'], explicit: [] },
      { id: 'a2', stores: ['chofu'], explicit: [] },
      { id: 'b1', stores: ['chofu'], explicit: ['seiseki'] },
      { id: 'b2', stores: ['chofu'], explicit: ['seiseki'] },
      { id: 'c1', stores: ['abeno'], explicit: ['other'] },
      { id: 'c2', stores: ['abeno'], explicit: ['other'] },
      { id: 'd1', stores: ['abeno', 'chofu'], explicit: [] },
      { id: 'd2', stores: ['abeno', 'chofu'], explicit: [] },
      { id: 'e1', stores: ['abeno', 'chofu'], explicit: ['abeno'] },
      { id: 'e2', stores: ['abeno', 'chofu'], explicit: ['abeno'] },
      { id: 'f1', stores: ['abeno'], explicit: ['abeno', 'seiseki'] },
      { id: 'f2', stores: ['abeno'], explicit: ['seiseki'] }
    ]
    const before = inputs.map(({ id, stores, explicit }) => makeEvent(id, { stores, characterIds: explicit }))
    // バックフィルが書くのは、娘が空のイベントだけ。明示のあるイベントは変わらない。
    const after = inputs.map(({ id, stores, explicit }) =>
      makeEvent(id, { stores, characterIds: explicit.length === 0 ? [...stores] : explicit })
    )
    expect(uuids(deduplicateRegularCards(after))).toEqual(uuids(deduplicateRegularCards(before)))
    expect(uuids(deduplicateRegularCards(before))).toEqual(['a1', 'a2', 'b1', 'c1', 'd1', 'd2', 'e1', 'f1', 'f2'])
  })

  test('空の一覧は空のまま返し、入力は書き換えない', () => {
    expect(deduplicateRegularCards([])).toEqual([])
    const events = [makeEvent('first'), makeEvent('second')]
    deduplicateRegularCards(events)
    expect(uuids(events)).toEqual(['first', 'second'])
  })
})
