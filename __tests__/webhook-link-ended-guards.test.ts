import { expect, test } from 'bun:test'
import { resolveWebhookJob } from '@api/services/webhook-admin'
import {
  candidateRow,
  END_AT_STORED,
  eventRow,
  interruptBeforeBatch,
  jobRow,
  references,
  seedEndCandidates,
  seedEndJob,
  seedTargetEvent,
  socialJobs,
  withDatabase,
  withFlags
} from './fixtures/webhook-link-ended'

// 終了判定の連携は、リースの喪失や読み取り後の競合では何も反映しない。
// batch の直前に別経路が割り込んだ状況を再現し、参照URL・ended_at・投稿・ジョブ行のどれも変わらないことを確かめる。

const conflictOf = async (run: Promise<unknown>) => {
  try {
    await run
  } catch (error) {
    if (error instanceof Error && 'status' in error) return { status: error.status, message: error.message }
    throw error
  }
  throw new Error('Expected a conflict')
}

test('losing the lease before the batch applies nothing and answers 409 Job lease lost', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { eventId } = await seedTargetEvent(env, 1)
    const before = await eventRow(env, eventId)
    const beforeReferences = await references(env, eventId)
    const { postId } = await seedEndJob(env, 2)
    const stolen = interruptBeforeBatch(env, async () => {
      await env.DB.prepare("UPDATE webhook_event_jobs SET lease_token='other-worker' WHERE post_id=?")
        .bind(postId)
        .run()
    })

    expect(await conflictOf(resolveWebhookJob(stolen.env, postId, { action: 'link', eventId }))).toEqual({
      status: 409,
      message: 'Job lease lost'
    })
    expect(stolen.state.fired).toBe(true)

    expect(await eventRow(env, eventId)).toEqual(before)
    expect(await references(env, eventId)).toEqual(beforeReferences)
    expect(await socialJobs(env)).toHaveLength(0)
    expect(await jobRow(env, postId)).toMatchObject({ status: 'held', event_id: null })
  })
}, 60000)

test('an ended_at written by another path before the batch is kept, and nothing is posted twice', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { eventId } = await seedTargetEvent(env, 1)
    const beforeReferences = await references(env, eventId)
    const { postId } = await seedEndJob(env, 2)
    const raced = interruptBeforeBatch(env, async () => {
      await env.DB.prepare(
        "UPDATE events SET ended_at='2026-10-18T00:00:00.000+00:00',updated_at='2026-10-31T00:00:00.000+00:00' WHERE id=?"
      )
        .bind(eventId)
        .run()
    })

    expect(await conflictOf(resolveWebhookJob(raced.env, postId, { action: 'link', eventId }))).toEqual({
      status: 409,
      message: 'Event changed concurrently; retry required'
    })
    expect(raced.state.fired).toBe(true)

    expect(await eventRow(env, eventId)).toEqual({
      ended_at: '2026-10-18T00:00:00.000+00:00',
      updated_at: '2026-10-31T00:00:00.000+00:00'
    })
    expect(await references(env, eventId)).toEqual(beforeReferences)
    expect(await socialJobs(env)).toHaveLength(0)
    expect(await jobRow(env, postId)).toMatchObject({ status: 'held', event_id: null })
  })
}, 60000)

test('an unverified event gets ended_at and the end reference but is never announced', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { eventId } = await seedTargetEvent(env, 1)
    await env.DB.prepare('UPDATE events SET is_verified=0 WHERE id=?').bind(eventId).run()
    const { postId } = await seedEndJob(env, 2)
    await resolveWebhookJob(env, postId, { action: 'link', eventId })

    expect((await eventRow(env, eventId))?.ended_at).toBe(END_AT_STORED)
    expect(await socialJobs(env)).toHaveLength(0)
  })
}, 60000)

test('a multi-candidate post ends the event only for the selected end candidate', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'false' })
    const { eventId } = await seedTargetEvent(env, 1)
    const other = await seedTargetEvent(env, 3)
    const otherBefore = await eventRow(env, other.eventId)
    const { postId, sourceUrl, uuids } = await seedEndCandidates(env, 2, ['announce', 'end'])

    // 終了ではない候補の連携は従来どおり。イベントは変わらず、announce の参照URLだけが足される。
    await resolveWebhookJob(env, postId, { action: 'link', eventId: other.eventId, candidateId: uuids[0] })
    expect(await eventRow(env, other.eventId)).toEqual(otherBefore)
    expect(await references(env, other.eventId)).toContainEqual({ type: 'announce', url: sourceUrl })
    expect(await socialJobs(env)).toHaveLength(0)
    expect(await candidateRow(env, uuids[0])).toMatchObject({ status: 'registered', event_id: other.eventId })

    const resolved = await resolveWebhookJob(env, postId, { action: 'link', eventId, candidateId: uuids[1] })

    expect(resolved.candidates.find((candidate) => candidate.eventUUID === uuids[1])).toMatchObject({
      status: 'registered',
      eventId
    })
    expect((await eventRow(env, eventId))?.ended_at).toBe(END_AT_STORED)
    expect(await references(env, eventId)).toContainEqual({ type: 'end', url: sourceUrl })
    expect(await eventRow(env, other.eventId)).toEqual(otherBefore)
    const rows = await socialJobs(env)
    expect(rows).toHaveLength(1)
    expect(rows[0].channel).toBe('x')
    expect(rows[0].key.startsWith(`updated:${eventId}:`)).toBe(true)
    expect(await candidateRow(env, uuids[1])).toMatchObject({
      status: 'registered',
      event_id: eventId,
      lease_token: null
    })
  })
}, 60000)

test('losing the lease on a candidate applies nothing either', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { eventId } = await seedTargetEvent(env, 1)
    const before = await eventRow(env, eventId)
    const { postId, uuids } = await seedEndCandidates(env, 2, ['end', 'end'])
    const stolen = interruptBeforeBatch(env, async () => {
      await env.DB.prepare("UPDATE webhook_event_candidates SET lease_token='other-worker' WHERE event_uuid=?")
        .bind(uuids[1])
        .run()
    })

    expect(
      await conflictOf(resolveWebhookJob(stolen.env, postId, { action: 'link', eventId, candidateId: uuids[1] }))
    ).toEqual({ status: 409, message: 'Job lease lost' })
    expect(stolen.state.fired).toBe(true)

    expect(await eventRow(env, eventId)).toEqual(before)
    expect(await socialJobs(env)).toHaveLength(0)
    expect(await candidateRow(env, uuids[1])).toMatchObject({ status: 'held', event_id: null })
  })
}, 60000)
