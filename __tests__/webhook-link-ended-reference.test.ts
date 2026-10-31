import { expect, test } from 'bun:test'
import { resolveWebhookJob } from '@api/services/webhook-admin'
import {
  answersOf,
  END_AT_STORED,
  eventRow,
  references,
  seedEndJob,
  seedTargetEvent,
  snapshotOf,
  socialJobs,
  withDatabase,
  withFlags
} from './fixtures/webhook-link-ended'

// 終了判定の連携は、ended_at を投稿日の日本時間 0 時（管理画面のフォームと同じ形）で書き、
// 旧コードが announce で入れた終了ツイートの URL は、行を増やさず end へ直す。

const markAsEnd = (env: Parameters<typeof seedTargetEvent>[0], postId: string) =>
  env.DB.prepare('UPDATE webhook_event_jobs SET answers_json=? WHERE post_id=?').bind(answersOf('end'), postId).run()

test('re-linking a job that the old code linked keeps the row count, turns its announce into end, and quotes the end tweet', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'false' })
    const { eventId, announceUrl } = await seedTargetEvent(env, 1)
    const { postId, sourceUrl } = await seedEndJob(env, 2, { postStatus: null })
    // 旧コードの連携: 終了判定でもイベントは変えず、投稿 URL を announce で足すだけ。
    await resolveWebhookJob(env, postId, { action: 'link', eventId })
    expect(await references(env, eventId)).toEqual([
      { type: 'announce', url: announceUrl },
      { type: 'announce', url: sourceUrl }
    ])
    expect((await eventRow(env, eventId))?.ended_at).toBeNull()

    await markAsEnd(env, postId)
    await resolveWebhookJob(env, postId, { action: 'link', eventId })

    expect(await references(env, eventId)).toEqual([
      { type: 'announce', url: announceUrl },
      { type: 'end', url: sourceUrl }
    ])
    expect((await eventRow(env, eventId))?.ended_at).toBe(END_AT_STORED)
    const rows = await socialJobs(env)
    expect(rows).toHaveLength(1)
    expect(rows[0].key.startsWith(`updated:${eventId}:`)).toBe(true)
    expect(snapshotOf(rows[0]).quoteTweetId).toBe(postId)
  })
}, 60000)

test('when ended_at is already set the announce is still turned into end, but nothing is posted', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { eventId, announceUrl } = await seedTargetEvent(env, 1, { endedAt: '2026-10-15T09:00:00+09:00' })
    const { postId, sourceUrl } = await seedEndJob(env, 2, { postStatus: null })
    await resolveWebhookJob(env, postId, { action: 'link', eventId })
    const before = await eventRow(env, eventId)

    await markAsEnd(env, postId)
    await resolveWebhookJob(env, postId, { action: 'link', eventId })

    expect(await references(env, eventId)).toEqual([
      { type: 'announce', url: announceUrl },
      { type: 'end', url: sourceUrl }
    ])
    expect(await eventRow(env, eventId)).toEqual(before)
    expect(await socialJobs(env)).toHaveLength(0)
  })
}, 60000)

test('an existing start or end row with the same URL is left as it is, and no row is added', async () => {
  for (const type of ['start', 'end']) {
    await withDatabase(async (bindings) => {
      const env = withFlags(bindings, { x: 'true', discord: 'false' })
      const { eventId, announceUrl } = await seedTargetEvent(env, 1)
      const { postId, sourceUrl } = await seedEndJob(env, 2)
      await env.DB.prepare(
        "INSERT INTO event_reference_urls (id,event_id,type,url,created_at,updated_at) VALUES (?,?,?,?,'2026-10-20T00:00:00.000+00:00','2026-10-20T00:00:00.000+00:00')"
      )
        .bind(crypto.randomUUID(), eventId, type, sourceUrl)
        .run()

      await resolveWebhookJob(env, postId, { action: 'link', eventId })

      expect(await references(env, eventId)).toEqual([
        { type: 'announce', url: announceUrl },
        { type, url: sourceUrl }
      ])
      expect((await eventRow(env, eventId))?.ended_at).toBe(END_AT_STORED)
      expect(await socialJobs(env)).toHaveLength(1)
    })
  }
}, 60000)

test('ended_at is midnight JST of the post day, so a post that is still the previous day in UTC lands on the next JST day', async () => {
  for (const scenario of [
    // 日本時間 10/25 23:30 は UTC でも 10/25。日本時間 10/25 0 時 = UTC 10/24 15:00。
    { postedAt: '2026-10-25T14:30:00Z', endedAt: '2026-10-24T15:00:00.000+00:00' },
    // 日本時間 10/26 00:30 は UTC では 10/25。日にちは日本時間で決まるので 10/26 0 時 = UTC 10/25 15:00。
    { postedAt: '2026-10-25T15:30:00Z', endedAt: '2026-10-25T15:00:00.000+00:00' }
  ]) {
    await withDatabase(async (bindings) => {
      const env = withFlags(bindings, { x: 'true', discord: 'false' })
      const { eventId } = await seedTargetEvent(env, 1)
      const { postId } = await seedEndJob(env, 2, { createdAt: scenario.postedAt })
      await resolveWebhookJob(env, postId, { action: 'link', eventId })
      expect((await eventRow(env, eventId))?.ended_at).toBe(scenario.endedAt)
    })
  }
}, 60000)

test('the start day is compared by JST day: a post on the start day but before the start time still ends the event', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'false' })
    // 開始は日本時間 10/11 12:00。投稿は同じ日の 01:00（開始の瞬間より前）。
    const { eventId } = await seedTargetEvent(env, 1, { startDate: '2026-10-11T12:00:00+09:00' })
    const { postId } = await seedEndJob(env, 2, { createdAt: '2026-10-10T16:00:00Z' })
    await resolveWebhookJob(env, postId, { action: 'link', eventId })
    expect((await eventRow(env, eventId))?.ended_at).toBe('2026-10-10T15:00:00.000+00:00')
    expect(await socialJobs(env)).toHaveLength(1)
  })
}, 60000)

test('a post on the day before the start (JST) does not end the event even when it is the start day in UTC', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'false' })
    // 開始は日本時間 10/11 0 時（UTC 10/10 15:00）。投稿は日本時間 10/10 23:30（UTC 10/10 14:30）。UTC の日付では開始日と同じ。
    const { eventId } = await seedTargetEvent(env, 1)
    const before = await eventRow(env, eventId)
    const { postId } = await seedEndJob(env, 2, { createdAt: '2026-10-10T14:30:00Z' })
    await resolveWebhookJob(env, postId, { action: 'link', eventId })
    expect(await eventRow(env, eventId)).toEqual(before)
    expect(await socialJobs(env)).toHaveLength(0)
  })
}, 60000)
