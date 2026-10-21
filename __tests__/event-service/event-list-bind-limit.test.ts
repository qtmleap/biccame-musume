import { describe, expect, test } from 'bun:test'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import type { StoreKey } from '@biccame/shared/schemas/store.dto'
import dayjs from 'dayjs'
import { type EventListFetch, withEventListDatabase } from '../fixtures/event-list-worker'

// D1 のバインド数上限 (100) を超える件数を投入する。
const TOTAL = 160
const WEBHOOK_TOTAL = 120
const BASE_DAY = dayjs('2026-01-01T00:00:00Z')

const eventId = (index: number) => `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`
// 投入順と開始日の順がずれるよう、160 と互いに素な 7 を掛けて並べ替える。
const dayOffset = (index: number) => (index * 7) % TOTAL
// 3 件に 1 件は未確認とする。
const isVerified = (index: number) => index % 3 !== 0
const indexes = Array.from({ length: TOTAL }, (_, index) => index)

// 条件・店舗の数を件ごとに変える。
const conditionCount = (index: number) => (index % 2 === 0 ? 2 : 1)
const storeKeys = (index: number): StoreKey[] => (index % 4 === 0 ? ['abeno', 'akiba'] : ['akiba'])

const now = toD1DateTime(BASE_DAY)

const insertEvent = (env: Bindings, index: number) => [
  env.DB.prepare(`INSERT INTO events (id,category,title,start_date,is_verified,clef_post_id,created_at,updated_at)
    VALUES (?,'limited_card',?,?,?,?,?,?)`).bind(
    eventId(index),
    `イベント${index}`,
    toD1DateTime(BASE_DAY.add(dayOffset(index), 'day')),
    isVerified(index) ? 1 : 0,
    `post-${index}`,
    now,
    now
  ),
  ...storeKeys(index).map((storeKey) =>
    env.DB.prepare('INSERT INTO event_stores (id,event_id,store_key,created_at,updated_at) VALUES (?,?,?,?,?)').bind(
      crypto.randomUUID(),
      eventId(index),
      storeKey,
      now,
      now
    )
  ),
  ...Array.from({ length: conditionCount(index) }, () =>
    env.DB.prepare(
      "INSERT INTO event_conditions (id,event_id,type,created_at,updated_at) VALUES (?,?,'everyone',?,?)"
    ).bind(crypto.randomUUID(), eventId(index), now, now)
  )
]

const insertWebhookJob = (env: Bindings, index: number) =>
  env.DB.prepare(`INSERT INTO webhook_event_jobs
    (post_id,post_json,source_url,event_uuid,event_id,status,created_at,updated_at)
    VALUES (?,'{}','https://example.invalid/post',?,?,'registered',?,?)`).bind(
    `post-${index}`,
    eventId(index),
    eventId(index),
    now,
    now
  )

/** D1 の batch を 20 文ずつ逐次実行する。 */
const runBatches = async (env: Bindings, statements: D1PreparedStatement[]) => {
  for (const offset of Array.from({ length: Math.ceil(statements.length / 20) }, (_, step) => step * 20)) {
    await env.DB.batch(statements.slice(offset, offset + 20))
  }
}

// 開始日の降順 (日付オフセットの大きい順) に並んだ期待値。
const expectedOrder = (predicate: (index: number) => boolean) =>
  indexes
    .filter(predicate)
    .toSorted((left, right) => dayOffset(right) - dayOffset(left))
    .map(eventId)

const seed = async (env: Bindings) => {
  await runBatches(
    env,
    indexes.flatMap((index) => insertEvent(env, index))
  )
  await runBatches(
    env,
    indexes.filter((index) => index < WEBHOOK_TOTAL).map((index) => insertWebhookJob(env, index))
  )
}

const expectRelations = async (list: EventListFetch, kind: 'events' | 'admin-events' | 'webhook-events') => {
  const events = await list(kind)
  const byId = new Map(indexes.map((index) => [eventId(index), index]))
  for (const event of events) {
    const index = byId.get(event.uuid)
    expect(index).toBeDefined()
    if (index === undefined) continue
    expect(event.stores.toSorted()).toEqual(storeKeys(index))
    expect(event.conditions).toHaveLength(conditionCount(index))
    expect(event.isVerified).toBe(isVerified(index))
  }
  return events
}

const withSeededDatabase = (run: (list: EventListFetch) => Promise<void>) =>
  withEventListDatabase(async (env, list) => {
    await seed(env)
    await run(list)
  })

describe('イベント一覧 — D1 のバインド数上限を超える件数', () => {
  test('getAdminEvents は 160 件すべてを開始日降順で関連を欠かさず返す', async () => {
    await withSeededDatabase(async (list) => {
      const events = await expectRelations(list, 'admin-events')
      expect(events).toHaveLength(TOTAL)
      expect(events.map((event) => event.uuid)).toEqual(expectedOrder(() => true))
    })
  }, 60_000)

  test('getEvents は 100 件を超える確認済みイベントを開始日降順で関連を欠かさず返す', async () => {
    await withSeededDatabase(async (list) => {
      const events = await expectRelations(list, 'events')
      expect(events.length).toBeGreaterThan(100)
      expect(events.map((event) => event.uuid)).toEqual(expectedOrder(isVerified))
    })
  }, 60_000)

  test('getAdminWebhookEvents は 100 件を超える Webhook 由来イベントを開始日降順で返す', async () => {
    await withSeededDatabase(async (list) => {
      const events = await expectRelations(list, 'webhook-events')
      expect(events).toHaveLength(WEBHOOK_TOTAL)
      expect(events.map((event) => event.uuid)).toEqual(expectedOrder((index) => index < WEBHOOK_TOTAL))
    })
  }, 60_000)
})
