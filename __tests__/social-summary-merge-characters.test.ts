import { expect, test } from 'bun:test'
import { socialImageCharacters } from '@api/lib/social-post-image'
import { ROW_AVATAR_LIMIT } from '@api/lib/social-post-image-common'
import type { Event } from '@biccame/shared/schemas/event.dto'
import { daily, required, sideRows, startingToday, uuid } from './fixtures/social-post-domain'

// 毎朝・毎週の行をまとめるキー（social-post.ts の mergeKey）が、対象の娘の「空」と「開催店舗の娘」を同じに扱うことを固定する。
// バックフィルの前（娘が空）と後（店舗の娘が明示）で、まとまりが変わらないこと。

const TITLE = 'バレンタイン名刺'
type Spec = { stores: Event['stores']; characterIds: Event['characterIds'] }

/** 同じ題名・日付・条件で、店舗と娘だけが違うイベントを作る。uuid は1から順に付く。 */
const campaign = (specs: Spec[]) => specs.map((spec, index) => startingToday(index + 1, { title: TITLE, ...spec }))

/** 行ごとの元イベントの uuid の並び。件数だけでなく、誰がまとまったかを比べる。 */
const grouping = (events: Event[]) =>
  sideRows(required(daily(events, [])), 'starting')
    .flat()
    .map((row) => row.eventIds)

const ids = (...numbers: number[]) => numbers.map(uuid)
const STORES = ['akiba', 'chiba', 'honten', 'shinyoko'] as const
const empty = STORES.map((store): Spec => ({ stores: [store], characterIds: [] }))
const own = STORES.map((store): Spec => ({ stores: [store], characterIds: [store] }))

test('娘が空のイベントは、店舗違いで1行にまとまる', () => {
  expect(grouping(campaign(empty))).toEqual([ids(1, 2, 3, 4)])
})

test('各店舗が自店舗の娘を持つイベントも、1行にまとまる', () => {
  expect(grouping(campaign(own))).toEqual([ids(1, 2, 3, 4)])
})

test('バックフィルの前後で、まとまりの中身が変わらない', () => {
  expect(grouping(campaign(own))).toEqual(grouping(campaign(empty)))
})

test('娘が空のイベントと自店舗の娘を持つイベントが混ざっても、1行にまとまる', () => {
  const mixed: Spec[] = [empty[0], own[1], empty[2], own[3]]
  expect(grouping(campaign(mixed))).toEqual([ids(1, 2, 3, 4)])
})

test('複数店舗のイベントで、娘がその開催店舗の娘だけなら、単独店舗のイベントとまとまる', () => {
  const specs: Spec[] = [
    { stores: ['akiba', 'chiba'], characterIds: ['akiba', 'chiba'] },
    { stores: ['honten'], characterIds: [] },
    { stores: ['shinyoko'], characterIds: ['shinyoko'] }
  ]
  expect(grouping(campaign(specs))).toEqual([ids(1, 2, 3)])
})

test('別の店舗の娘を明示したイベントは、バックフィルの前後どちらでもまとまらない', () => {
  const before: Spec[] = [empty[0], empty[1], { stores: ['honten'], characterIds: ['akiba'] }, empty[3]]
  const after: Spec[] = [own[0], own[1], { stores: ['honten'], characterIds: ['akiba'] }, own[3]]
  const expected = [ids(1, 2, 4), ids(3)]
  expect(grouping(campaign(before))).toEqual(expected)
  expect(grouping(campaign(after))).toEqual(expected)
})

test('店舗の娘に別の娘を足したイベントは、店舗の娘だけのイベントとまとまらない', () => {
  const specs: Spec[] = [own[0], { stores: ['chiba'], characterIds: ['chiba', 'honten'] }, own[2]]
  const [first, second, third] = ids(1, 2, 3)
  expect(grouping(campaign(specs))).toEqual([[first, third], [second]])
})

test('other と secret を明示したイベントは、店舗の娘のイベントとまとまらず、互いにも分かれる', () => {
  const specs: Spec[] = [
    own[0],
    { stores: ['chiba'], characterIds: ['other'] },
    { stores: ['honten'], characterIds: ['secret'] },
    empty[3]
  ]
  const [first, second, third, fourth] = ids(1, 2, 3, 4)
  expect(grouping(campaign(specs))).toEqual([[first, fourth], [second], [third]])
})

test('同じ別の娘を明示したイベント同士は、店舗が違ってもまとまる', () => {
  const specs: Spec[] = [
    { stores: ['akiba'], characterIds: ['other'] },
    { stores: ['chiba'], characterIds: ['other'] },
    { stores: ['honten'], characterIds: ['secret'] }
  ]
  const [first, second, third] = ids(1, 2, 3)
  expect(grouping(campaign(specs))).toEqual([[first, second], [third]])
})

test('娘の並び順に依らず、同じ娘を明示したイベントとしてまとまる', () => {
  const specs: Spec[] = [
    { stores: ['akiba'], characterIds: ['chiba', 'honten'] },
    { stores: ['akiba'], characterIds: ['honten', 'chiba'] }
  ]
  expect(grouping(campaign(specs))).toEqual([ids(1, 2)])
})

test('店舗の娘に別の娘を足した共同デザインは、別の娘だけのイベントとまとまらない', () => {
  const specs: Spec[] = [
    { stores: ['chiba'], characterIds: ['chiba', 'honten'] },
    { stores: ['chiba'], characterIds: ['honten'] },
    { stores: ['chiba'], characterIds: ['honten', 'chiba'] }
  ]
  const [first, second, third] = ids(1, 2, 3)
  expect(grouping(campaign(specs))).toEqual([[first, third], [second]])
})

test('開催店舗の一部だけを明示したイベントは、娘が空のイベントとまとまらない（バックフィル前と同じ）', () => {
  const specs: Spec[] = [
    { stores: ['akiba', 'chiba'], characterIds: ['akiba'] },
    { stores: ['akiba', 'chiba'], characterIds: [] },
    { stores: ['akiba', 'chiba'], characterIds: ['akiba', 'chiba'] },
    { stores: ['akiba', 'chiba'], characterIds: ['akiba'] }
  ]
  const [first, second, third, fourth] = ids(1, 2, 3, 4)
  expect(grouping(campaign(specs))).toEqual([
    [first, fourth],
    [second, third]
  ])
})

test('題名が違えば、娘が同じでもまとまらない', () => {
  const events = [
    startingToday(1, { title: TITLE, stores: ['akiba'], characterIds: ['akiba'] }),
    startingToday(2, { title: '夏名刺', stores: ['chiba'], characterIds: ['chiba'] })
  ]
  expect(grouping(events)).toHaveLength(2)
})

const avatarsOf = (events: Event[]) =>
  sideRows(required(daily(events, [])), 'starting')
    .flat()
    .map((row) => row.avatars)

test('店舗違いの2イベントがそれぞれ自店舗の娘を持つなら、1行にまとまり、アバターは2人分', () => {
  expect(avatarsOf(campaign([own[0], own[1]]))).toEqual([['akiba', 'chiba']])
})

test('1店舗の行は、その店舗の娘1人のアバター', () => {
  expect(avatarsOf(campaign([own[2]]))).toEqual([['honten']])
})

test('娘が空の行は、アバターが空のまま（変わらない）', () => {
  expect(avatarsOf(campaign(empty))).toEqual([[]])
})

test('娘が空のイベントと自店舗の娘を持つイベントが混ざった行は、娘のあるイベントのアバターだけ', () => {
  expect(avatarsOf(campaign([empty[0], own[1], empty[2]]))).toEqual([['chiba']])
})

test('明示で同じ別の娘を持つ店舗違いのイベントは、1行で1人（重複なし）', () => {
  const specs: Spec[] = [
    { stores: ['akiba'], characterIds: ['other'] },
    { stores: ['chiba'], characterIds: ['other'] }
  ]
  expect(avatarsOf(campaign(specs))).toEqual([['other']])
})

test('最初に現れた順で並び、複数の娘を持つイベントも重複しない', () => {
  const specs: Spec[] = [
    { stores: ['akiba', 'chiba'], characterIds: ['akiba', 'chiba'] },
    { stores: ['honten'], characterIds: ['honten'] },
    { stores: ['chiba'], characterIds: ['chiba'] }
  ]
  expect(avatarsOf(campaign(specs))).toEqual([['akiba', 'chiba', 'honten']])
})

test('4店舗がまとまった行は、4人分のアバターを持つ（描画側が先頭3人に絞る）', () => {
  expect(avatarsOf(campaign(own))).toEqual([['akiba', 'chiba', 'honten', 'shinyoko']])
})

test('Avatar の読み込み対象は、1行あたり描画と同じ ROW_AVATAR_LIMIT 人までに絞る', () => {
  const snapshot = required(daily(campaign(own), []))
  const [image] = snapshot.images
  expect(avatarsOf(campaign(own))[0]).toHaveLength(STORES.length)
  expect(ROW_AVATAR_LIMIT).toBe(3)
  expect(socialImageCharacters(image)).toEqual(['akiba', 'chiba', 'honten'])
})
