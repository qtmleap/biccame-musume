import { expect, test } from 'bun:test'
import adminWebhookRoutes from '@api/routes/admin-webhook'
import { rejudgeWebhookJob, resolveWebhookJob } from '@api/services/webhook-admin'
import { claimWebhookJob, getWebhookJob } from '@api/services/webhook-jobs'
import { WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import {
  conflictOf,
  event,
  heldSeed,
  ignoredSeed,
  rawRejudgeRow,
  rejectedSeed,
  rejudgePostId,
  seedRejudgeJob,
  withRejudgeEnv
} from './fixtures/webhook-d1-jobs'

test('rejudge resets a held job to queued, clears stored judgement and enqueues it once', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const postId = await seedRejudgeJob(env, 1, heldSeed)
    const postJsonBefore = await env.DB.prepare('SELECT post_json FROM webhook_event_jobs WHERE post_id=?')
      .bind(postId)
      .first<string>('post_json')
    const startedAt = dayjs().valueOf()
    const job = await rejudgeWebhookJob(env, postId)
    expect(job).toMatchObject({
      postId,
      status: 'queued',
      reasons: [],
      candidate: null,
      confidence: null,
      model: null,
      questionVersion: null,
      answers: null,
      draft: null,
      postStatus: null,
      postStatusProbability: null,
      judgedAt: null,
      notificationStatus: 'pending',
      notificationError: null,
      lastError: null
    })
    expect(await getWebhookJob(env, postId)).toEqual(job)
    const after = await rawRejudgeRow(env, postId)
    expect(after).toMatchObject({
      status: 'queued',
      result_json: null,
      answers_json: null,
      candidate_json: null,
      reasons_json: '[]',
      confidence: null,
      model: null,
      question_version: null,
      judged_at: null,
      semantic_key: null,
      notification_status: 'pending',
      notification_error: null,
      last_error: null,
      lease_token: null,
      lease_until: null
    })
    // 識別子・カウンタ・元投稿は変えない。
    expect(after).toMatchObject({
      post_id: postId,
      source_url: `https://x.com/bic_akiba/status/${postId}`,
      event_id: event.uuid,
      attempts: 3,
      notification_attempts: 2,
      created_at: 1791676800000
    })
    expect(after).toMatchObject({ event_uuid: job.eventUUID, post_json: postJsonBefore })
    const updatedAt = await env.DB.prepare('SELECT updated_at FROM webhook_event_jobs WHERE post_id=?')
      .bind(postId)
      .first<number>('updated_at')
    expect(updatedAt).toBeGreaterThanOrEqual(startedAt)
    expect(sent).toEqual([postId])
  })
}, 60000)

// 自動登録済み（registered で manually_linked なし）は 409 ではなく、登録を変えずに判定だけをやり直す（webhook-rejudge-registered.test.ts）。
test('rejudge rejects queued and processing jobs with 409 and changes nothing', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const statuses = ['queued', 'processing']
    for (const [index, status] of statuses.entries()) {
      const postId = await seedRejudgeJob(env, index + 1, { ...heldSeed, status })
      const before = await rawRejudgeRow(env, postId)
      expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
        status: 409,
        message: 'This job cannot be re-judged'
      })
      expect(await rawRejudgeRow(env, postId)).toEqual(before)
    }
    expect(sent).toEqual([])
  })
}, 60000)

test('rejudge resets an ignored job (not manually rejected) to queued, clears the judgement and enqueues it once', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const postId = await seedRejudgeJob(env, 1, ignoredSeed)
    const job = await rejudgeWebhookJob(env, postId)
    expect(job).toMatchObject({
      postId,
      status: 'queued',
      reasons: [],
      candidate: null,
      confidence: null,
      model: null,
      questionVersion: null,
      answers: null,
      judgedAt: null,
      notificationStatus: 'pending',
      notificationError: null,
      lastError: null
    })
    expect(await rawRejudgeRow(env, postId)).toMatchObject({
      status: 'queued',
      result_json: null,
      answers_json: null,
      candidate_json: null,
      reasons_json: '[]',
      semantic_key: null,
      notification_status: 'pending',
      notification_error: null,
      last_error: null,
      lease_token: null,
      lease_until: null,
      attempts: 3,
      notification_attempts: 2
    })
    expect(sent).toEqual([postId])
    // 再判定のあとは処理待ちなので、処理に進められる。
    expect(await claimWebhookJob(env, postId)).toEqual(expect.any(String))
  })
}, 60000)

test('rejudge rejects a manually rejected ignored job with 409 and changes nothing', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const postId = await seedRejudgeJob(env, 1, rejectedSeed)
    const before = await rawRejudgeRow(env, postId)
    expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
      status: 409,
      message: 'Manually rejected jobs cannot be re-judged'
    })
    expect(await rawRejudgeRow(env, postId)).toEqual(before)
    expect(sent).toEqual([])
  })
}, 60000)

test('rejudge refuses a job rejected through resolveWebhookJob, so the guard follows the real reject path', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const postId = await seedRejudgeJob(env, 1, heldSeed)
    await resolveWebhookJob(env, postId, { action: 'reject' })
    expect(await rawRejudgeRow(env, postId)).toMatchObject({
      status: 'ignored',
      reasons_json: '["manually_rejected"]'
    })
    const before = await rawRejudgeRow(env, postId)
    expect((await conflictOf(rejudgeWebhookJob(env, postId))).status).toBe(409)
    expect(await rawRejudgeRow(env, postId)).toEqual(before)
    expect(sent).toEqual([])
  })
}, 60000)

test('rejudge matches the manually_rejected reason exactly, not as a substring of another reason', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const postId = await seedRejudgeJob(env, 1, { ...ignoredSeed, reasons: ['possible_duplicate:manually_rejected_x'] })
    expect((await rejudgeWebhookJob(env, postId)).status).toBe('queued')
    expect(sent).toEqual([postId])
  })
}, 60000)

test('rejudge rejects a leased held job with 409, changes nothing, and works again once the lease expires', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const postId = await seedRejudgeJob(env, 1, { ...heldSeed, leaseUntil: dayjs().add(5, 'minute').valueOf() })
    const before = await rawRejudgeRow(env, postId)
    expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
      status: 409,
      message: 'Job is being processed'
    })
    expect(await rawRejudgeRow(env, postId)).toEqual(before)
    expect(sent).toEqual([])
    // リース切れのジョブは誰も処理していないため再判定できる。
    await env.DB.prepare('UPDATE webhook_event_jobs SET lease_until=? WHERE post_id=?')
      .bind(dayjs().subtract(1, 'minute').valueOf(), postId)
      .run()
    const job = await rejudgeWebhookJob(env, postId)
    expect(job.status).toBe('queued')
    expect(await rawRejudgeRow(env, postId)).toMatchObject({ lease_token: null, lease_until: null })
    expect(sent).toEqual([postId])
  })
}, 60000)

test('rejudge returns notification to pending even when it was sent, unknown or failed', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const notificationStatuses = ['sent', 'unknown', 'failed']
    for (const [index, notificationStatus] of notificationStatuses.entries()) {
      const postId = await seedRejudgeJob(env, index + 1, { ...heldSeed, notificationStatus })
      const job = await rejudgeWebhookJob(env, postId)
      expect(job.notificationStatus).toBe('pending')
      expect(job.notificationError).toBeNull()
      expect(await rawRejudgeRow(env, postId)).toMatchObject({
        notification_status: 'pending',
        notification_error: null
      })
    }
    expect(sent).toEqual(notificationStatuses.map((_, index) => rejudgePostId(index + 1)))
  })
}, 60000)

test('rejudge makes a held job claimable for reprocessing', async () => {
  await withRejudgeEnv(async (env) => {
    // 通知済みの保留ジョブは、再判定前は処理に進められない。
    const postId = await seedRejudgeJob(env, 1, { ...heldSeed, notificationStatus: 'sent' })
    expect(await claimWebhookJob(env, postId)).toBeNull()
    expect(await rawRejudgeRow(env, postId)).toMatchObject({ status: 'held', attempts: 3 })
    await rejudgeWebhookJob(env, postId)
    const token = await claimWebhookJob(env, postId)
    expect(token).toEqual(expect.any(String))
    expect(await rawRejudgeRow(env, postId)).toMatchObject({
      status: 'processing',
      attempts: 4,
      lease_token: token,
      result_json: null
    })
    // 取得済みのリースは重ねて取れない。
    expect(await claimWebhookJob(env, postId)).toBeNull()
  })
}, 60000)

test('rejudge route accepts a bodyless POST and maps errors to 404, 409 and 400', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const postId = await seedRejudgeJob(env, 1, heldSeed)
    const request = (id: string) =>
      adminWebhookRoutes.request(`/admin/webhook/jobs/${id}/rejudge`, { method: 'POST' }, env)
    const response = await request(postId)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = WebhookJobSchema.safeParse(await response.json())
    expect(body.success).toBe(true)
    expect(body.success ? body.data : null).toMatchObject({ postId, status: 'queued', notificationStatus: 'pending' })
    expect(sent).toEqual([postId])
    // 処理中（queued）になったジョブ、存在しないジョブ、形式の違う ID は再実行できない。
    const again = await request(postId)
    expect(again.status).toBe(409)
    expect(await again.text()).toBe('This job cannot be re-judged')
    expect((await request('9999')).status).toBe(404)
    expect((await request('not-a-post-id')).status).toBe(400)
    expect(sent).toEqual([postId])
    // AI が対象外にしたジョブは再実行できるが、人が却下したジョブは 409。
    const ignoredId = await seedRejudgeJob(env, 2, ignoredSeed)
    expect((await request(ignoredId)).status).toBe(200)
    const rejectedId = await seedRejudgeJob(env, 3, rejectedSeed)
    const rejected = await request(rejectedId)
    expect(rejected.status).toBe(409)
    expect(await rejected.text()).toBe('Manually rejected jobs cannot be re-judged')
    expect(sent).toEqual([postId, ignoredId])
  })
}, 60000)
