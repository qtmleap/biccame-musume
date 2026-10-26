import { expect, test } from 'bun:test'
import { unfinishedStoreEvents } from '@api/services/webhook-linked-event'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { LINKED_EVENT_MAX_OPTIONS } from '@biccame/shared/event-detect/detection'
import dayjs from 'dayjs'
import { withRejudgeEnv } from './fixtures/webhook-d1-jobs'

// 日本時間の 2026-10-26 10:00 を「今日」にする。終了予定日の境界は日本時間の今日の 0 時。
const NOW = dayjs('2026-10-26T10:00:00+09:00')
const jst = (value: string) => toD1DateTime(dayjs(value))
const uuid = (index: number) => `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`

type Seed = { index: number; stores: string[]; start?: string; end?: string | null; endedAt?: string | null }

const seed = async (env: Bindings, { index, stores, start, end = null, endedAt = null }: Seed) => {
  const now = jst('2026-10-01T00:00:00+09:00')
  await env.DB.prepare(
    'INSERT INTO events(id,category,title,start_date,end_date,ended_at,updated_at) VALUES (?,?,?,?,?,?,?)'
  )
    .bind(
      uuid(index),
      'limited_card',
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
const idsOf = async (env: Bindings, store: string) => (await unfinishedStoreEvents(env, store, NOW)).map((e) => e.id)
const snapshot = async (env: Bindings) =>
  JSON.stringify([
    (await env.DB.prepare('SELECT * FROM events ORDER BY id').all()).results,
    (await env.DB.prepare('SELECT * FROM event_stores ORDER BY id').all()).results
  ])

test('その店舗の、まだ終了していないイベントだけを返し、終了済み・過去の終了予定・他店舗を除く', async () => {
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
    const events = await unfinishedStoreEvents(env, 'akiba', NOW)
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
    const [found] = await unfinishedStoreEvents(env, 'akiba', NOW)
    expect(found).toEqual({
      id: uuid(1),
      title: 'イベント1',
      category: 'limited_card',
      startDate: jst('2026-10-01T00:00:00+09:00'),
      endDate: jst('2026-10-31T23:59:59+09:00')
    })
  })
}, 60000)
