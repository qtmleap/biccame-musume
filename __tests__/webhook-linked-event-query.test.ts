import { expect, test } from 'bun:test'
import { type UnfinishedEventScope, unfinishedStoreEvents } from '@api/services/webhook-linked-event'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { LINKED_EVENT_MAX_OPTIONS } from '@biccame/shared/event-detect/detection'
import dayjs from 'dayjs'
import { withRejudgeEnv } from './fixtures/webhook-d1-jobs'

// 日本時間の 2026-10-26 10:00 を「今日」にする。終了予定日の境界は日本時間の今日の 0 時。
const NOW = dayjs('2026-10-26T10:00:00+09:00')
// 探す種類。種類の一致は必須で、全種類を取る経路は無いので、種類に関係しないテストは 5 種類すべてを指定する。
const ALL_KINDS = ['limited_card', 'regular_card', 'ackey', 'acsta', 'other']
// 投稿日時。既定の開始日（2026-10-01）より後で、今日と同じ時刻。開始日が投稿より後のイベントは出ない。
const POSTED = '2026-10-26T01:00:00.000Z'
const jst = (value: string) => toD1DateTime(dayjs(value))
const uuid = (index: number) => `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`

type Seed = {
  index: number
  stores: string[]
  category?: string
  start?: string
  end?: string | null
  endedAt?: string | null
}

const seed = async (
  env: Bindings,
  { index, stores, category = 'limited_card', start, end = null, endedAt = null }: Seed
) => {
  const now = jst('2026-10-01T00:00:00+09:00')
  await env.DB.prepare(
    'INSERT INTO events(id,category,title,start_date,end_date,ended_at,updated_at) VALUES (?,?,?,?,?,?,?)'
  )
    .bind(
      uuid(index),
      category,
      `イベント${index}`,
      start === undefined ? jst('2026-10-01T00:00:00+09:00') : start,
      end,
      endedAt,
      now
    )
    .run()
  for (const store of stores)
    await env.DB.prepare('INSERT INTO event_stores(id,event_id,store_key,updated_at) VALUES (?,?,?,?)')
      .bind(crypto.randomUUID(), uuid(index), store, now)
      .run()
}
const idsOf = async (env: Bindings, store: string, scope: Partial<UnfinishedEventScope> = {}) =>
  (await unfinishedStoreEvents(env, store, { postedAt: POSTED, kinds: ALL_KINDS, ...scope }, NOW)).map((e) => e.id)
const snapshot = async (env: Bindings) =>
  JSON.stringify([
    (await env.DB.prepare('SELECT * FROM events ORDER BY id').all()).results,
    (await env.DB.prepare('SELECT * FROM event_stores ORDER BY id').all()).results
  ])

test('その店舗の、継続中（まだ終了していない）のイベントだけを返し、終了済み・過去の終了予定・他店舗を除く', async () => {
  await withRejudgeEnv(async (env) => {
    // 1: 終了予定なし（対象） 2: 終了予定が今日の終わり（対象） 3: 終了予定が昨日の終わり（過去なので除く）
    // 4: 実際に終了済み（ended_at あり。終了予定が将来でも除く） 5: 他店舗だけ 6: 複数店舗（秋葉原を含むので対象）
    await seed(env, { index: 1, stores: ['akiba'] })
    await seed(env, { index: 2, stores: ['akiba'], end: jst('2026-10-26T23:59:59+09:00') })
    await seed(env, { index: 3, stores: ['akiba'], end: jst('2026-10-25T23:59:59+09:00') })
    await seed(env, {
      index: 4,
      stores: ['akiba'],
      end: jst('2026-11-30T23:59:59+09:00'),
      endedAt: jst('2026-10-20T12:00:00+09:00')
    })
    await seed(env, { index: 5, stores: ['abeno'] })
    await seed(env, { index: 6, stores: ['abeno', 'akiba'] })
    const before = await snapshot(env)
    expect((await idsOf(env, 'akiba')).toSorted()).toEqual([uuid(1), uuid(2), uuid(6)])
    expect((await idsOf(env, 'abeno')).toSorted()).toEqual([uuid(5), uuid(6)])
    expect(await idsOf(env, 'unknown_store')).toEqual([])
    // 読み取りだけで、events も event_stores も書き換えない。
    expect(await snapshot(env)).toBe(before)
  })
}, 60000)

test('新しい開始日順で、最大 50 件まで返す', async () => {
  await withRejudgeEnv(async (env) => {
    // 投入は 1 件ずつ順に行う（開始日は index 日前）。
    for (const index of Array.from({ length: LINKED_EVENT_MAX_OPTIONS + 5 }, (_, offset) => offset + 1))
      await seed(env, {
        index,
        stores: ['akiba'],
        start: jst(NOW.subtract(index, 'day').format('YYYY-MM-DDT00:00:00+09:00'))
      })
    const events = await unfinishedStoreEvents(env, 'akiba', { postedAt: POSTED, kinds: ALL_KINDS }, NOW)
    expect(events).toHaveLength(LINKED_EVENT_MAX_OPTIONS)
    expect(events[0].id).toBe(uuid(1))
    expect(events.map((e) => e.startDate)).toEqual(
      events
        .map((e) => e.startDate)
        .toSorted()
        .toReversed()
    )
    // 新しい 50 件だけで、古い 5 件は含まれない。
    expect(events.some((e) => e.id === uuid(LINKED_EVENT_MAX_OPTIONS + 1))).toBe(false)
  })
}, 60000)

test('選択肢の説明に使う項目（タイトル・種類・開始日・終了予定）を D1 の保存形式のまま返す', async () => {
  await withRejudgeEnv(async (env) => {
    await seed(env, { index: 1, stores: ['akiba'], end: jst('2026-10-31T23:59:59+09:00') })
    const [found] = await unfinishedStoreEvents(env, 'akiba', { postedAt: POSTED, kinds: ALL_KINDS }, NOW)
    expect(found).toEqual({
      id: uuid(1),
      title: 'イベント1',
      category: 'limited_card',
      startDate: jst('2026-10-01T00:00:00+09:00'),
      endDate: jst('2026-10-31T23:59:59+09:00')
    })
  })
}, 60000)

test('投稿日時より後に始まるイベントは出ない。ちょうど投稿日時に始まるものと、それより前のものは出る', async () => {
  await withRejudgeEnv(async (env) => {
    // 1: 投稿の 1 ミリ秒前に開始（対象） 2: ちょうど投稿日時に開始（対象） 3: 投稿の 1 ミリ秒後に開始（除く） 4: 投稿の翌日に開始（除く） 5: 投稿の 1 か月前に開始（対象）
    await seed(env, { index: 1, stores: ['akiba'], start: jst('2026-10-26T09:59:59.999+09:00') })
    await seed(env, { index: 2, stores: ['akiba'], start: jst('2026-10-26T10:00:00.000+09:00') })
    await seed(env, { index: 3, stores: ['akiba'], start: jst('2026-10-26T10:00:00.001+09:00') })
    await seed(env, { index: 4, stores: ['akiba'], start: jst('2026-10-27T00:00:00+09:00') })
    await seed(env, { index: 5, stores: ['akiba'], start: jst('2026-09-26T00:00:00+09:00') })
    expect(await idsOf(env, 'akiba')).toEqual([uuid(2), uuid(1), uuid(5)])
    // 基準は「今」ではなく投稿日時。投稿をもっと前（2026-10-01 の 0 時）にすると、それより後に始まるものは出ない。
    expect(await idsOf(env, 'akiba', { postedAt: '2026-09-30T15:00:00.000Z' })).toEqual([uuid(5)])
    // 投稿をもっと後にすると、3 と 4 も出る。
    expect((await idsOf(env, 'akiba', { postedAt: '2026-12-01T00:00:00.000Z' })).toSorted()).toEqual(
      [1, 2, 3, 4, 5].map(uuid).toSorted()
    )
  })
}, 60000)

test('投稿日時は Z 付き・オフセット付きのどちらの ISO 文字列でも、D1 の保存形式に直して比べる', async () => {
  await withRejudgeEnv(async (env) => {
    await seed(env, { index: 1, stores: ['akiba'], start: jst('2026-10-26T10:00:00+09:00') })
    expect(await idsOf(env, 'akiba', { postedAt: '2026-10-26T01:00:00Z' })).toEqual([uuid(1)])
    expect(await idsOf(env, 'akiba', { postedAt: '2026-10-26T10:00:00+09:00' })).toEqual([uuid(1)])
    expect(await idsOf(env, 'akiba', { postedAt: '2026-10-26T09:59:59+09:00' })).toEqual([])
  })
}, 60000)

test('種類を指定すると、その種類（複数種類の配列も）のイベントだけを返す', async () => {
  await withRejudgeEnv(async (env) => {
    await seed(env, { index: 1, stores: ['akiba'], category: 'limited_card' })
    await seed(env, { index: 2, stores: ['akiba'], category: 'regular_card' })
    await seed(env, { index: 3, stores: ['akiba'], category: 'ackey' })
    await seed(env, { index: 4, stores: ['akiba'], category: 'acsta' })
    await seed(env, { index: 5, stores: ['akiba'], category: 'other' })
    const sorted = async (kinds: readonly string[]) => (await idsOf(env, 'akiba', { kinds })).toSorted()
    // 5 種類すべてを指定すれば全部。
    expect(await sorted(ALL_KINDS)).toEqual([1, 2, 3, 4, 5].map(uuid).toSorted())
    expect(await sorted(['ackey'])).toEqual([uuid(3)])
    expect(await sorted(['acsta'])).toEqual([uuid(4)])
    expect(await sorted(['other'])).toEqual([uuid(5)])
    expect(await sorted(['limited_card', 'regular_card'])).toEqual([uuid(1), uuid(2)].toSorted())
    // 空配列は「種類なし」で、全種類には広げず空を返す。存在しない種類も空。
    expect(await sorted([])).toEqual([])
    expect(await sorted(['unknown_kind'])).toEqual([])
  })
}, 60000)

test('種類を指定しても、終了済み・過去の終了予定・他店舗・投稿より後に始まるものは出ない', async () => {
  await withRejudgeEnv(async (env) => {
    // 1: 対象 2: 終了済み 3: 終了予定が過去 4: 他店舗 5: 投稿より後に開始 6: 種類が違う
    await seed(env, { index: 1, stores: ['akiba'], category: 'ackey' })
    await seed(env, { index: 2, stores: ['akiba'], category: 'ackey', endedAt: jst('2026-10-20T12:00:00+09:00') })
    await seed(env, { index: 3, stores: ['akiba'], category: 'ackey', end: jst('2026-10-25T23:59:59+09:00') })
    await seed(env, { index: 4, stores: ['abeno'], category: 'ackey' })
    await seed(env, { index: 5, stores: ['akiba'], category: 'ackey', start: jst('2026-10-27T00:00:00+09:00') })
    await seed(env, { index: 6, stores: ['akiba'], category: 'acsta' })
    const before = await snapshot(env)
    expect(await idsOf(env, 'akiba', { kinds: ['ackey'] })).toEqual([uuid(1)])
    expect(await idsOf(env, 'abeno', { kinds: ['ackey'] })).toEqual([uuid(4)])
    expect(await snapshot(env)).toBe(before)
  })
}, 60000)

test('種類の指定は SQL に連結せず束縛するので、SQL の断片を含む種類名でも絞りが壊れない', async () => {
  await withRejudgeEnv(async (env) => {
    await seed(env, { index: 1, stores: ['akiba'], category: 'ackey' })
    expect(await idsOf(env, 'akiba', { kinds: ["ackey' OR '1'='1"] })).toEqual([])
    expect(await idsOf(env, 'akiba', { kinds: ['ackey) OR (1=1'] })).toEqual([])
  })
}, 60000)
