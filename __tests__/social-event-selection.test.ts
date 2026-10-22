import { expect, test } from 'bun:test'
import { insert, uuid, withDatabase } from './fixtures/social-event-selection-db'
import { WEEK } from './fixtures/social-event-week'

test('starting selection keeps planned ends valid throughout the JST day and excludes all marked-ended events', async () => {
  await withDatabase(async (env, select) => {
    const start = '2026-10-12T00:00:00+09:00'
    await insert(env, { id: 1, start })
    await insert(env, { id: 2, start, end: '2026-10-12T08:59:59+09:00' })
    await insert(env, { id: 3, start, end: '2026-10-13T23:59:59+09:00', actual: '2026-10-12T08:00:00+09:00' })
    await insert(env, { id: 4, start, preliminary: true })
    await insert(env, { id: 5, start, verified: false })
    await insert(env, { id: 6, start: '2026-10-11T23:59:59+09:00' })
    await insert(env, { id: 7, start: '2026-10-13T00:00:00+09:00' })
    await insert(env, { id: 8, start, end: '2026-10-12T08:00:00+09:00', actual: '2026-10-12T10:00:00+09:00' })
    await insert(env, { id: 9, start, end: '2026-10-12T00:00:00+09:00' })
    await insert(env, { id: 10, start, end: '2026-10-11T23:59:59+09:00' })
    const events = await select('starting', { now: '2026-10-12T09:00:00+09:00' })
    expect(events.sort()).toEqual([uuid(1), uuid(2), uuid(4), uuid(9)])
  })
}, 60000)

test('ending selection prioritizes actual end and includes only the JST day even across UTC boundaries', async () => {
  await withDatabase(async (env, select) => {
    const start = '2026-10-01T00:00:00+09:00'
    await insert(env, { id: 1, start, end: '2026-10-18T23:59:59+09:00', actual: '2026-10-12T00:00:00+09:00' })
    await insert(env, { id: 2, start, end: '2026-10-12T23:59:59+09:00', actual: '2026-10-11T23:59:59+09:00' })
    await insert(env, { id: 3, start, end: '2026-10-12T23:59:59+09:00', actual: '2026-10-13T00:00:00+09:00' })
    await insert(env, { id: 4, start, end: '2026-10-12T23:59:59+09:00' })
    await insert(env, { id: 5, start, actual: '2026-10-12T23:59:59+09:00' })
    await insert(env, { id: 6, start, end: '2026-10-12T23:59:59+09:00', verified: false })
    await insert(env, { id: 7, start })
    const events = await select('ending', { now: '2026-10-12T09:00:00+09:00' })
    expect(events.sort()).toEqual([uuid(1), uuid(4), uuid(5)])
  })
}, 60000)

test('weekly start selection uses the JST Monday boundaries and only public events', async () => {
  await withDatabase(async (env, select) => {
    await insert(env, { id: 1, start: '2026-10-12T00:00:00+09:00' })
    await insert(env, { id: 2, start: '2026-10-11T23:59:59+09:00' })
    await insert(env, { id: 3, start: '2026-10-18T23:59:59+09:00' })
    await insert(env, { id: 4, start: '2026-10-19T00:00:00+09:00' })
    await insert(env, { id: 5, start: '2026-10-14T00:00:00+09:00', verified: false })
    await insert(env, { id: 6, start: '2026-10-14T00:00:00+09:00', preliminary: true })
    // 週の前に始まった継続中のイベントは、開始の一覧に入らない。
    await insert(env, { id: 7, start: '2026-10-01T00:00:00+09:00', end: '2026-10-30T23:59:59+09:00' })
    expect((await select('weekStarting', WEEK)).sort()).toEqual([uuid(1), uuid(3), uuid(6)])
  })
}, 60000)

test('weekly end selection prefers the actual end, uses the JST Monday boundaries and skips unknown ends', async () => {
  await withDatabase(async (env, select) => {
    const start = '2026-10-01T00:00:00+09:00'
    await insert(env, { id: 1, start, end: '2026-10-12T00:00:00+09:00' })
    await insert(env, { id: 2, start, end: '2026-10-11T23:59:59+09:00' })
    await insert(env, { id: 3, start, end: '2026-10-18T23:59:59+09:00' })
    await insert(env, { id: 4, start, end: '2026-10-19T00:00:00+09:00' })
    // endedAt が優先: 予定は週内でも実際の終了が前の週なら対象外、予定が週外でも実際の終了が週内なら対象。
    await insert(env, { id: 5, start, end: '2026-10-14T12:00:00+09:00', actual: '2026-10-11T12:00:00+09:00' })
    await insert(env, { id: 6, start, end: '2026-10-25T12:00:00+09:00', actual: '2026-10-14T12:00:00+09:00' })
    // 終了日不明は終了の一覧に入れない。
    await insert(env, { id: 7, start })
    await insert(env, { id: 8, start, end: '2026-10-14T12:00:00+09:00', verified: false })
    expect((await select('weekEnding', WEEK)).sort()).toEqual([uuid(1), uuid(3), uuid(6)])
  })
}, 60000)

// 週次の開始は日次の開始と違い、endedAt 付きや予定終了済みのイベントも除外しない。
// 週次は月曜朝に「これから始まる週」を出す用途で、週内に開始日があれば載せる意図的な差（日次は上の starting のテスト）。
test('weekly start selection intentionally keeps events with an actual end or a planned end already passed', async () => {
  await withDatabase(async (env, select) => {
    const start = '2026-10-14T00:00:00+09:00'
    await insert(env, { id: 1, start })
    await insert(env, { id: 2, start, end: '2026-10-14T08:00:00+09:00' })
    await insert(env, { id: 3, start, end: '2026-10-20T23:59:59+09:00', actual: '2026-10-14T09:00:00+09:00' })
    await insert(env, { id: 4, start, end: '2026-10-14T00:00:00+09:00', actual: '2026-10-14T00:00:00+09:00' })
    // 週外に開始したものは、終了の状態によらず対象外のまま。
    await insert(env, { id: 5, start: '2026-10-19T00:00:00+09:00', actual: '2026-10-19T09:00:00+09:00' })
    expect((await select('weekStarting', WEEK)).sort()).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)])
  })
}, 60000)
