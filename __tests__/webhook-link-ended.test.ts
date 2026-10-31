import { expect, test } from 'bun:test'
import { resolveWebhookJob } from '@api/services/webhook-admin'
import dayjs from 'dayjs'
import {
  END_AT_STORED,
  eventRow,
  jobRow,
  references,
  seedEndJob,
  seedTargetEvent,
  snapshotOf,
  socialJobs,
  withDatabase,
  withFlags
} from './fixtures/webhook-link-ended'

// 終了判定（postStatus が end）の投稿を既存イベントへ手動で連携したときに、
// 管理画面のイベント編集（shouldTweet 付き）と同じ結果になることを固定する。
// ended_at・end 参照URL・updated 投稿が、ジョブ行の更新と同じ D1 batch で確定する。実 API・リモート D1 には触れない。

test('linking an end post writes ended_at and an end reference, and queues one X update job quoting the end tweet', async () => {
  await withDatabase(async (bindings) => {
    const sent: unknown[] = []
    const env = withFlags(bindings, { x: 'true', discord: 'false' }, sent)
    const { eventId, announceUrl } = await seedTargetEvent(env, 1)
    const before = await eventRow(env, eventId)
    const { postId, sourceUrl } = await seedEndJob(env, 2)

    const resolved = await resolveWebhookJob(env, postId, { action: 'link', eventId })

    expect(resolved).toMatchObject({ status: 'registered', eventId })
    const after = await eventRow(env, eventId)
    expect(after?.ended_at).toBe(END_AT_STORED)
    expect(dayjs(String(after?.updated_at)).isAfter(dayjs(String(before?.updated_at)))).toBe(true)
    expect(await references(env, eventId)).toEqual([
      { type: 'announce', url: announceUrl },
      { type: 'end', url: sourceUrl }
    ])
    const rows = await socialJobs(env)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ channel: 'x', status: 'pending' })
    expect(rows[0].key.startsWith(`updated:${eventId}:`)).toBe(true)
    const snapshot = snapshotOf(rows[0])
    expect(snapshot.kind).toBe('updated')
    expect(snapshot.quoteTweetId).toBe(postId)
    expect(snapshot.scheduledAt).toBe(dayjs(String(after?.updated_at)).toISOString())
    // 即時回収: 登録直後の通知処理のキュー投入に加えて、投稿ジョブがキューへ送られる。
    expect(sent).toContainEqual({ kind: 'social', jobId: rows[0].id })
    expect(sent).toContainEqual({ postId })
  })
}, 60000)

test('both channels enabled queue an X job and a Discord job with the same key', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { eventId } = await seedTargetEvent(env, 1)
    const { postId } = await seedEndJob(env, 2)
    await resolveWebhookJob(env, postId, { action: 'link', eventId })

    const rows = await socialJobs(env)
    expect(rows.map((row) => row.channel)).toEqual(['discord', 'x'])
    expect(new Set(rows.map((row) => row.key)).size).toBe(1)
  })
}, 60000)

test('with both channels disabled ended_at and the end reference are still written but no job or queue message is made', async () => {
  await withDatabase(async (bindings) => {
    const sent: unknown[] = []
    const env = withFlags(bindings, { x: 'false', discord: 'false' }, sent)
    const { eventId } = await seedTargetEvent(env, 1)
    const { postId, sourceUrl } = await seedEndJob(env, 2)
    await resolveWebhookJob(env, postId, { action: 'link', eventId })

    expect((await eventRow(env, eventId))?.ended_at).toBe(END_AT_STORED)
    expect((await references(env, eventId)).filter((row) => row.type === 'end')).toEqual([
      { type: 'end', url: sourceUrl }
    ])
    expect(await socialJobs(env)).toHaveLength(0)
    expect(sent.some((message) => JSON.stringify(message).includes('"social"'))).toBe(false)
  })
}, 60000)

test('an event that already has ended_at keeps it and queues nothing, but still gets the end reference', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { eventId } = await seedTargetEvent(env, 1, { endedAt: '2026-10-15T09:00:00+09:00' })
    const before = await eventRow(env, eventId)
    const { postId, sourceUrl } = await seedEndJob(env, 2)
    await resolveWebhookJob(env, postId, { action: 'link', eventId })

    expect(await eventRow(env, eventId)).toEqual(before)
    expect((await references(env, eventId)).filter((row) => row.type === 'end')).toEqual([
      { type: 'end', url: sourceUrl }
    ])
    expect(await socialJobs(env)).toHaveLength(0)
    expect(await jobRow(env, postId)).toMatchObject({ status: 'registered', event_id: eventId })
  })
}, 60000)

test('linking the same event again is idempotent and never queues a second post', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'false' })
    const { eventId } = await seedTargetEvent(env, 1)
    const { postId } = await seedEndJob(env, 2)
    await resolveWebhookJob(env, postId, { action: 'link', eventId })
    const firstJobs = await socialJobs(env)
    const firstEvent = await eventRow(env, eventId)
    const firstReferences = await references(env, eventId)
    expect(firstJobs).toHaveLength(1)

    const again = await resolveWebhookJob(env, postId, { action: 'link', eventId })

    expect(again.status).toBe('registered')
    expect(await socialJobs(env)).toEqual(firstJobs)
    expect(await eventRow(env, eventId)).toEqual(firstEvent)
    expect(await references(env, eventId)).toEqual(firstReferences)
  })
}, 60000)

test('moving a registered link to another event ends the new event and leaves the first one as it was', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'false' })
    const first = await seedTargetEvent(env, 1)
    const second = await seedTargetEvent(env, 3)
    const { postId } = await seedEndJob(env, 2)
    await resolveWebhookJob(env, postId, { action: 'link', eventId: first.eventId })
    const firstEvent = await eventRow(env, first.eventId)

    const moved = await resolveWebhookJob(env, postId, { action: 'link', eventId: second.eventId })

    expect(moved).toMatchObject({ status: 'registered', eventId: second.eventId })
    expect(await eventRow(env, first.eventId)).toEqual(firstEvent)
    expect((await eventRow(env, second.eventId))?.ended_at).toBe(END_AT_STORED)
    const keys = (await socialJobs(env)).map((row) => row.key)
    expect(keys).toHaveLength(2)
    expect(keys.some((key) => key.startsWith(`updated:${first.eventId}:`))).toBe(true)
    expect(keys.some((key) => key.startsWith(`updated:${second.eventId}:`))).toBe(true)
  })
}, 60000)

test('an end tweet posted before the event started leaves ended_at empty and queues nothing, but adds the end reference', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { eventId } = await seedTargetEvent(env, 1)
    const before = await eventRow(env, eventId)
    const { postId, sourceUrl } = await seedEndJob(env, 2, { createdAt: '2026-10-10T00:00:00Z' })
    await resolveWebhookJob(env, postId, { action: 'link', eventId })

    expect(await eventRow(env, eventId)).toEqual(before)
    expect((await references(env, eventId)).filter((row) => row.type === 'end')).toEqual([
      { type: 'end', url: sourceUrl }
    ])
    expect(await socialJobs(env)).toHaveLength(0)
    expect(await jobRow(env, postId)).toMatchObject({ status: 'registered', event_id: eventId })
  })
}, 60000)

for (const postStatus of ['announce', 'start', 'ongoing', null] as const) {
  test(`linking a post whose status is ${postStatus} keeps the old behavior: an announce reference only, no end, no post`, async () => {
    await withDatabase(async (bindings) => {
      const env = withFlags(bindings, { x: 'true', discord: 'true' })
      const { eventId, announceUrl } = await seedTargetEvent(env, 1)
      const before = await eventRow(env, eventId)
      const { postId, sourceUrl } = await seedEndJob(env, 2, { postStatus })
      await resolveWebhookJob(env, postId, { action: 'link', eventId })

      expect(await eventRow(env, eventId)).toEqual(before)
      expect(await references(env, eventId)).toEqual([
        { type: 'announce', url: announceUrl },
        { type: 'announce', url: sourceUrl }
      ])
      expect(await socialJobs(env)).toHaveLength(0)
      expect(await jobRow(env, postId)).toMatchObject({ status: 'registered', event_id: eventId })
    })
  }, 60000)
}
