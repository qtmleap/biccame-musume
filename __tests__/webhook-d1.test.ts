import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import adminWebhookRoutes from '@api/routes/admin-webhook'
import { rejudgeWebhookJob, resolveWebhookJob } from '@api/services/webhook-admin'
import {
  claimWebhookJob,
  getWebhookJob,
  insertWebhookJob,
  listWebhookJobs,
  registerWebhookEvent
} from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { webhookKeywordVerdict } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { WebhookJobListSchema, WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const event: EventRequest = {
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  category: 'limited_card',
  title: 'テスト配布',
  stores: ['akiba'],
  startDate: '2026-10-11T00:00:00+09:00',
  isVerified: true,
  isPreliminary: false,
  shouldTweet: false,
  conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
  referenceUrls: [
    {
      uuid: '22222222-2222-4222-a222-222222222222',
      type: 'announce',
      url: 'https://x.com/bic_akiba/status/2109221721773576390'
    }
  ]
}
const makeJob = () => {
  const parsed = WebhookJobSchema.safeParse({
    postId: '2109221721773576390',
    post: {
      id: '2109221721773576390',
      screenName: 'bic_akiba',
      text: '本日より限定名刺を全員に配布',
      createdAt: '2026-10-11T00:00:00Z',
      kind: 'original',
      url: event.referenceUrls[0].url,
      media: []
    },
    sourceUrl: event.referenceUrls[0].url,
    eventUUID: event.uuid,
    status: 'processing',
    reasons: [],
    candidate: event,
    confidence: 0.99,
    model: 'clef',
    questionVersion: 'test-v1',
    eventId: null,
    eventTitle: null,
    postStatus: 'start',
    postStatusProbability: 0.99,
    answers: null,
    draft: null,
    attempts: 1,
    notificationStatus: 'pending',
    notificationId: null,
    notificationError: null,
    notificationAttempts: 0,
    lastError: null,
    createdAt: '2026-10-11T00:00:00Z',
    updatedAt: '2026-10-11T00:00:00Z',
    judgedAt: '2026-10-11T00:00:00Z'
  })
  if (!parsed.success) throw new Error('Invalid test job')
  return parsed.data
}

test('local D1 atomically registers event children and job; failed batch rolls back', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-d1-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const db = await mf.getD1Database('DB')
    const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) {
      const sql = await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')
      await db.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))
    }
    const job = makeJob()
    await db
      .prepare(
        `INSERT INTO webhook_event_jobs(post_id,post_json,source_url,event_uuid,status,lease_token,answers_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        job.postId,
        JSON.stringify(job.post),
        job.sourceUrl,
        job.eventUUID,
        'processing',
        'test-lease',
        '{"is_event":{"type":"noul","noul":0.99}}',
        1791676800000,
        1791676800000
      )
      .run()
    const invalid = { ...event, conditions: [event.conditions[0], event.conditions[0]] }
    await expect(registerWebhookEvent({ DB: db }, job, invalid, 'test-lease')).rejects.toThrow()
    expect(await db.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
    expect(await db.prepare('SELECT status FROM webhook_event_jobs').first<string>('status')).toBe('processing')
    await registerWebhookEvent({ DB: db }, job, event, 'test-lease')
    expect(await db.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    expect(await db.prepare('SELECT count(*) AS total FROM event_conditions').first<number>('total')).toBe(1)
    expect(await db.prepare('SELECT count(*) AS total FROM event_stores').first<number>('total')).toBe(1)
    expect(await db.prepare('SELECT count(*) AS total FROM event_reference_urls').first<number>('total')).toBe(1)
    expect(await db.prepare('SELECT status FROM webhook_event_jobs').first<string>('status')).toBe('registered')
    expect(await db.prepare('SELECT clef_answers FROM events').first<string>('clef_answers')).toBe(
      '{"is_event":{"type":"noul","noul":0.99}}'
    )
    await expect(registerWebhookEvent({ DB: db }, job, event, 'different-lease')).rejects.toThrow('lease lost')
    expect(await db.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)

    await db.prepare('UPDATE events SET title=? WHERE id=?').bind('紐付け先の実イベント名', event.uuid).run()
    await db
      .prepare('UPDATE webhook_event_jobs SET candidate_json=NULL,confidence=0.72,model=? WHERE post_id=?')
      .bind('clef-flash', job.postId)
      .run()
    for (const status of ['announce', 'start', 'ongoing', 'end'] as const) {
      await db
        .prepare('UPDATE webhook_event_jobs SET answers_json=? WHERE post_id=?')
        .bind(
          JSON.stringify({ status: { type: 'choice', choice: status, probabilities: { [status]: 0.99 } } }),
          job.postId
        )
        .run()
      const detail = await getWebhookJob({ DB: db }, job.postId)
      const page = await listWebhookJobs({ DB: db }, { limit: 1, status: 'registered' })
      expect(detail).toMatchObject({
        postStatus: status,
        postStatusProbability: 0.99,
        answers: { status: { type: 'choice', choice: status, probabilities: { [status]: 0.99 } } },
        draft: null,
        eventId: event.uuid,
        eventTitle: '紐付け先の実イベント名',
        candidate: null,
        confidence: 0.72,
        model: 'clef-flash'
      })
      expect(page.jobs[0]).toEqual(detail)
      expect(page.nextCursor).toBeNull()
    }
    // [保存された answers_json, answers が null になるか]。壊れた JSON・スキーマ違反は null、読める回答は postStatus が無くても残す。
    for (const [answers, broken] of [
      [null, true],
      ['{}', false],
      ['{broken', true],
      ['{"status":{"type":"noul","noul":0.9}}', false],
      ['{"status":{"type":"choice","choice":"none","probabilities":{"none":1}}}', false],
      ['{"status":{"type":"choice","choice":"future","probabilities":{"future":1}}}', false],
      ['{"status":{"type":"choice","choice":"start","probabilities":{"start":2}}}', true]
    ] as const) {
      await db.prepare('UPDATE webhook_event_jobs SET answers_json=? WHERE post_id=?').bind(answers, job.postId).run()
      const unreadable = await getWebhookJob({ DB: db }, job.postId)
      expect(unreadable.postStatus).toBeNull()
      expect(unreadable.postStatusProbability).toBeNull()
      expect(unreadable.draft).toBeNull()
      expect(unreadable.answers === null).toBe(broken)
    }

    // 保留ジョブだけが、保存済みの回答から読み取り時に計算した下書きを持つ。
    const heldAnswers: Record<string, ClefAnswer> = {
      is_event: { type: 'noul', noul: 0.72 },
      status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.7499, start: 0.2 } },
      category: { type: 'choice', choice: 'acsta', probabilities: { acsta: 0.45, ackey: 0.43, other: 0.02 } },
      store: { type: 'choice', choice: 'none', probabilities: { none: 0.61, akiba: 0.39 } },
      start_date: { type: 'choice', choice: 'd20261011', probabilities: { d20261011: 0.8, none: 0.1 } },
      condition: { type: 'choice', choice: 'everyone', probabilities: { everyone: 0.7, none: 0.2 } }
    }
    const setHeld = async (status: string, answers: unknown) => {
      await db
        .prepare('UPDATE webhook_event_jobs SET status=?,answers_json=?,event_id=NULL WHERE post_id=?')
        .bind(status, answers === null ? null : JSON.stringify(answers), job.postId)
        .run()
    }
    await setHeld('held', heldAnswers)
    const held = await getWebhookJob({ DB: db }, job.postId)
    expect(held).toMatchObject({
      status: 'held',
      postStatus: 'announce',
      postStatusProbability: 0.7499,
      draft: {
        title: 'アキバたん 配布',
        stores: ['akiba'],
        startDate: '2026-10-11',
        conditions: [{ type: 'everyone' }]
      }
    })
    expect(held.draft).not.toHaveProperty('category')
    // 管理画面の回答表に渡す保存済みの回答がそのまま返る。
    expect(held.answers).toEqual(heldAnswers)
    // 一覧も同じ内容で、下書きに乱数を含まないため詳細と一致する。
    expect((await listWebhookJobs({ DB: db }, { limit: 1, status: 'held' })).jobs[0]).toEqual(held)
    // 登録済み・対象外は回答が残っていても下書きを持たない。
    for (const status of ['registered', 'ignored', 'queued', 'failed']) {
      await setHeld(status, heldAnswers)
      const other = await getWebhookJob({ DB: db }, job.postId)
      expect(other.draft).toBeNull()
      expect(other.postStatusProbability).toBe(0.7499)
    }
    // 保留でも回答が無い・壊れている場合は例外にせず null にする。
    for (const answers of [null, 'not-json', { status: { type: 'choice', choice: 'announce' } }]) {
      await db
        .prepare('UPDATE webhook_event_jobs SET status=?,answers_json=? WHERE post_id=?')
        .bind(
          'held',
          typeof answers === 'string' ? answers : answers === null ? null : JSON.stringify(answers),
          job.postId
        )
        .run()
      const broken = await getWebhookJob({ DB: db }, job.postId)
      expect(broken.draft).toBeNull()
    }
    // 回答が空でも例外にせず、投稿アカウントから分かる店舗だけの下書きになる。
    await setHeld('held', {})
    expect((await getWebhookJob({ DB: db }, job.postId)).draft).toEqual({
      title: 'アキバたん 配布',
      stores: ['akiba'],
      conditions: []
    })
    // 回答の形は正しくても値が不正（存在しない日付・数量0）な場合、その項目だけ落として一覧全体は壊さない。
    await setHeld('held', {
      ...heldAnswers,
      start_date: { type: 'choice', choice: 'd20261399', probabilities: { d20261399: 0.9 } },
      end_date: { type: 'choice', choice: 'd20260230', probabilities: { d20260230: 0.9 } },
      quantity: { type: 'choice', choice: 'q0', probabilities: { q0: 0.9 } },
      condition: { type: 'choice', choice: 'first_come', probabilities: { first_come: 0.9 } }
    })
    const corrupt = await listWebhookJobs({ DB: db }, { limit: 5, status: 'held' })
    expect(corrupt.jobs).toHaveLength(1)
    const corruptDraft = WebhookJobSchema.shape.draft.safeParse(corrupt.jobs[0]?.draft)
    expect(corruptDraft.success).toBe(true)
    expect(corrupt.jobs[0]?.draft).toEqual({
      title: 'アキバたん 配布',
      stores: ['akiba'],
      conditions: [{ type: 'first_come' }]
    })
    await setHeld('registered', heldAnswers)
    await db.prepare('UPDATE webhook_event_jobs SET event_id=? WHERE post_id=?').bind(event.uuid, job.postId).run()

    const unlinked = await insertWebhookJob({ DB: db }, { ...job.post, id: '2109221721773576391' })
    expect(unlinked).toMatchObject({
      postStatus: null,
      postStatusProbability: null,
      draft: null,
      eventId: null,
      eventTitle: null,
      model: null,
      confidence: null
    })
    await db.prepare('UPDATE webhook_event_jobs SET created_at=?').bind(1791676800000).run()
    const first = await listWebhookJobs({ DB: db }, { limit: 1 })
    expect(first.jobs[0].postId).toBe(unlinked.postId)
    expect(first.nextCursor).toBe(unlinked.postId)
    const second = await listWebhookJobs({ DB: db }, { limit: 1, cursor: unlinked.postId })
    expect(second.jobs[0].postId).toBe(job.postId)
    expect(second.nextCursor).toBeNull()
    await db.prepare('DELETE FROM events WHERE id=?').bind(event.uuid).run()
    expect((await getWebhookJob({ DB: db }, job.postId)).eventTitle).toBeNull()
  } finally {
    await mf.dispose()
  }
}, 60000)

// 再判定のテスト。モックのキューを持つ Bindings とマイグレーション済みのローカルD1を用意する。
const withRejudgeEnv = async (run: (env: Bindings, sent: string[]) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-rejudge-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const sent: string[] = []
    const env = Object.assign(await mf.getBindings<Bindings>(), {
      EVENT_DETECTION_QUEUE: {
        send: async (message: { postId: string }) => {
          sent.push(message.postId)
        }
      }
    })
    const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) {
      const sql = await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')
      await env.DB.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))
    }
    await run(env, sent)
  } finally {
    await mf.dispose()
  }
}

const rejudgePostId = (index: number) => `210922172177357${String(index).padStart(4, '0')}`

type RejudgeSeed = { status: string; notificationStatus: string; leaseUntil: number | null; reasons: string[] }
const heldSeed: RejudgeSeed = {
  status: 'held',
  notificationStatus: 'failed',
  leaseUntil: null,
  reasons: ['needs_review']
}
// AI が自動で対象外にしたジョブ。対象外のジョブは通知を送らないため notification_status は skipped。
const ignoredSeed: RejudgeSeed = {
  status: 'ignored',
  notificationStatus: 'skipped',
  leaseUntil: null,
  reasons: ['not_distribution_event']
}
// 管理画面で人が却下したジョブ。resolveWebhookJob の reject が書く reasons と同じ。
const rejectedSeed: RejudgeSeed = { ...ignoredSeed, reasons: ['manually_rejected'] }

/** 保存済みの判定結果・回答・エラーをすべて埋めたジョブを作る。消えるべき列が最初から null だと検証にならない。 */
const seedRejudgeJob = async (env: Bindings, index: number, seed: RejudgeSeed) => {
  const postId = rejudgePostId(index)
  const post: DetectPost = {
    id: postId,
    screenName: 'bic_akiba',
    text: '本日より限定名刺を全員に配布',
    createdAt: '2026-10-11T00:00:00Z',
    kind: 'original',
    url: `https://x.com/bic_akiba/status/${postId}`,
    media: []
  }
  await insertWebhookJob(env, post)
  await env.DB.prepare(`UPDATE webhook_event_jobs SET status=?,result_json=?,answers_json=?,candidate_json=?,
    reasons_json=?,confidence=?,model=?,question_version=?,judged_at=?,semantic_key=?,event_id=?,attempts=?,
    notification_status=?,notification_id=?,notification_error=?,notification_attempts=?,last_error=?,
    lease_token=?,lease_until=?,created_at=?,updated_at=? WHERE post_id=?`)
    .bind(
      seed.status,
      '{"answers":{"is_event":{"type":"noul","noul":0.72}}}',
      '{"is_event":{"type":"noul","noul":0.72}}',
      JSON.stringify(event),
      JSON.stringify(seed.reasons),
      0.72,
      'clef-flash',
      'old-v1',
      1791676800000,
      `semantic-${postId}`,
      event.uuid,
      3,
      seed.notificationStatus,
      'message-1',
      'previous notification error',
      2,
      'previous processing error',
      seed.leaseUntil === null ? null : 'other-worker',
      seed.leaseUntil,
      1791676800000,
      1791676800000,
      postId
    )
    .run()
  return postId
}

const rawRejudgeRow = (env: Bindings, postId: string) =>
  env.DB.prepare('SELECT * FROM webhook_event_jobs WHERE post_id=?').bind(postId).first()

const conflictOf = async (run: Promise<unknown>) => {
  try {
    await run
  } catch (error) {
    if (error instanceof HTTPException) return { status: error.status, message: error.message }
    throw error
  }
  throw new Error('Expected a conflict')
}

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

test('rejudge rejects every status other than held and ignored with 409 and changes nothing', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const statuses = ['registered', 'failed', 'queued', 'processing']
    for (const [index, status] of statuses.entries()) {
      const postId = await seedRejudgeJob(env, index + 1, { ...heldSeed, status })
      const before = await rawRejudgeRow(env, postId)
      expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
        status: 409,
        message: 'Only held or ignored jobs can be re-judged'
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
    // 保留でも対象外でもなくなったジョブ、存在しないジョブ、形式の違う ID は再実行できない。
    const again = await request(postId)
    expect(again.status).toBe(409)
    expect(await again.text()).toBe('Only held or ignored jobs can be re-judged')
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

// ---- 受信履歴の絞り込み・並べ替え ----

type ListSeed = {
  postId: string
  /** 受信日時(ms)。 */
  createdAt: number
  /** null は未判定。 */
  confidence: number | null
  text: string
  screenName?: string
  kind?: DetectPost['kind']
  /** ジョブの状態。省略は held。 */
  status?: string
  /** 保存する回答（answers_json）。省略と null は未保存(NULL)。壊れた JSON もそのまま入れて確かめる。 */
  answersJson?: string | null
}

const MATCH_TEXT = 'あべのたん限定名刺 2026年11月3日から先着100枚を配布します'
const MISMATCH_TEXT = '日常のあいさつです'

/** 判定の期待値は本文から推測せず、判定関数そのものを通して確かめてから使う。 */
const verdictOf = (seed: ListSeed) => webhookKeywordVerdict(listSeedPost(seed))

const listSeedPost = (seed: ListSeed): DetectPost => ({
  id: seed.postId,
  screenName: seed.screenName === undefined ? 'bic_abeno' : seed.screenName,
  text: seed.text,
  createdAt: '2026-10-11T00:00:00Z',
  kind: seed.kind === undefined ? 'original' : seed.kind,
  url: `https://x.com/bic_abeno/status/${seed.postId}`,
  media: []
})

const seedListJobs = async (env: Bindings, seeds: readonly ListSeed[]) => {
  for (const seed of seeds) {
    await env.DB.prepare(
      `INSERT INTO webhook_event_jobs(post_id,post_json,source_url,event_uuid,status,answers_json,confidence,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
      .bind(
        seed.postId,
        JSON.stringify(listSeedPost(seed)),
        `https://x.com/bic_abeno/status/${seed.postId}`,
        crypto.randomUUID(),
        seed.status === undefined ? 'held' : seed.status,
        seed.answersJson === undefined ? null : seed.answersJson,
        seed.confidence,
        seed.createdAt,
        seed.createdAt
      )
      .run()
  }
}

/** 期待する並び。SQL とは独立に JS で作る。NULL は最小値(-1)、同値は投稿IDで同じ向きに並べる。 */
const expectedOrder = (
  seeds: readonly ListSeed[],
  sort: 'createdAt' | 'confidence',
  order: 'asc' | 'desc'
): string[] => {
  const keyOf = (seed: ListSeed) =>
    sort === 'createdAt' ? seed.createdAt : seed.confidence === null ? -1 : seed.confidence
  const sign = order === 'asc' ? 1 : -1
  return seeds
    .toSorted((a, b) => {
      const byKey = keyOf(a) - keyOf(b)
      if (byKey !== 0) return sign * byKey
      // 投稿IDは TEXT の比較(SQLite の既定は 2 進数順)。桁数が違えば桁数の少ない方が先になるとは限らない。
      return sign * (a.postId < b.postId ? -1 : a.postId > b.postId ? 1 : 0)
    })
    .map((seed) => seed.postId)
}

type ListOptions = Parameters<typeof listWebhookJobs>[1]
type ListScan = Parameters<typeof listWebhookJobs>[2]

/** nextCursor が null になるまで辿り、各ページの投稿IDを返す。無限ループ防止に上限を持つ。 */
const walkPages = async (
  env: Bindings,
  options: ListOptions,
  scan?: ListScan,
  cursor?: string,
  pages: readonly string[][] = []
): Promise<string[][]> => {
  if (pages.length >= 200) throw new Error('Pagination did not terminate')
  const page = await listWebhookJobs(env, cursor === undefined ? options : { ...options, cursor }, scan)
  const collected = [...pages, page.jobs.map((job) => job.postId)]
  return page.nextCursor === null ? collected : walkPages(env, options, scan, page.nextCursor, collected)
}

const HOUR = 3_600_000
const BASE = 1_791_676_800_000

/**
 * 重複・欠落を捉えるための並び。
 * - 投稿IDの桁数が違う(9, 10, 100, 1000)。TEXT 比較なので '9' > '10' になる。
 * - created_at の同値、confidence の同値、複数の NULL。
 * - 判定は一致・不一致・除外(リツイート)が混在する。
 */
const pagingSeeds: readonly ListSeed[] = [
  { postId: '9', createdAt: BASE, confidence: 0.5, text: MATCH_TEXT },
  { postId: '10', createdAt: BASE, confidence: 0.5, text: MISMATCH_TEXT },
  { postId: '100', createdAt: BASE, confidence: null, text: MATCH_TEXT },
  { postId: '1000', createdAt: BASE + 1, confidence: null, text: MATCH_TEXT, kind: 'retweet' },
  { postId: '11', createdAt: BASE + 1, confidence: 0.9, text: MISMATCH_TEXT },
  { postId: '12', createdAt: BASE + 2, confidence: 0, text: MATCH_TEXT },
  { postId: '13', createdAt: BASE + 2, confidence: 1, text: MATCH_TEXT },
  { postId: '14', createdAt: BASE + 3, confidence: 0.9, text: MISMATCH_TEXT, kind: 'retweet' },
  { postId: '15', createdAt: BASE + 3, confidence: null, text: MATCH_TEXT },
  { postId: '16', createdAt: BASE + 4, confidence: 0.25, text: MATCH_TEXT }
]

test('list: every sort and order pages without duplicates or gaps, NULL confidence is the lowest', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, pagingSeeds)
    for (const sort of ['createdAt', 'confidence'] as const) {
      for (const order of ['asc', 'desc'] as const) {
        const expected = expectedOrder(pagingSeeds, sort, order)
        for (const limit of [1, 2, 3, 4, 100]) {
          const pages = await walkPages(env, { limit, sort, order })
          // 連結した結果が、順序・重複・欠落まで含めて期待順と完全に一致する。
          expect(pages.flat()).toEqual(expected)
          for (const page of pages.slice(0, -1)) expect(page).toHaveLength(limit)
        }
      }
    }
    // 並びを省略すると受信日時の新しい順。
    expect((await walkPages(env, { limit: 100 })).flat()).toEqual(expectedOrder(pagingSeeds, 'createdAt', 'desc'))
    // 精度の昇順は、未判定(NULL)が先頭に来る。
    const lowest = (await listWebhookJobs(env, { limit: 100, sort: 'confidence', order: 'asc' })).jobs
    expect(lowest.slice(0, 3).map((job) => job.confidence)).toEqual([null, null, null])
    expect(lowest.at(-1)?.confidence).toBe(1)
  })
}, 60000)

test('list: range keeps only jobs received within the window', async () => {
  await withRejudgeEnv(async (env) => {
    const now = dayjs().valueOf()
    // 境界ちょうどを避け、30分前・2時間前・25時間前にする。
    const seeds: ListSeed[] = [
      { postId: '201', createdAt: now - 30 * 60_000, confidence: 0.5, text: MATCH_TEXT },
      { postId: '202', createdAt: now - 2 * HOUR, confidence: 0.5, text: MATCH_TEXT },
      { postId: '203', createdAt: now - 25 * HOUR, confidence: 0.5, text: MATCH_TEXT },
      { postId: '204', createdAt: now - 10 * 60_000, confidence: null, text: MATCH_TEXT }
    ]
    await seedListJobs(env, seeds)
    const ids = async (range?: '1h' | '24h') => (await walkPages(env, { limit: 1, range })).flat()
    expect(await ids()).toEqual(['204', '201', '202', '203'])
    expect(await ids('1h')).toEqual(['204', '201'])
    expect(await ids('24h')).toEqual(['204', '201', '202'])
    // 他の条件と組み合わせても、窓は受信日時(created_at)で決まる。精度の昇順は未判定(NULL)が先頭。
    const byConfidence = await walkPages(env, { limit: 1, range: '24h', sort: 'confidence', order: 'asc' })
    expect(byConfidence.flat()).toEqual(['204', '201', '202'])
  })
}, 60000)

/** 判定の絞り込みテスト用の並び。受信日時の新しい順に並べたときの判定を、先頭から固定する。 */
const verdictSeeds = (verdicts: readonly ('match' | 'mismatch' | 'excluded')[]): ListSeed[] =>
  verdicts.map((verdict, index) => ({
    postId: String(3000 + index),
    // index が小さいほど新しい(= 日時の新しい順で先に出る)。
    createdAt: BASE + 1000 - index,
    confidence: index % 3 === 0 ? null : (index % 10) / 10,
    text: verdict === 'mismatch' ? MISMATCH_TEXT : MATCH_TEXT,
    kind: verdict === 'excluded' ? 'retweet' : 'original'
  }))

test('list verdict: the stored posts really produce match, mismatch and excluded', () => {
  expect(new Set(pagingSeeds.map(verdictOf))).toEqual(new Set(['match', 'mismatch', 'excluded']))
  expect(pagingSeeds.filter((seed) => verdictOf(seed) === 'match').length).toBeGreaterThan(0)
})

test('list verdict: filters by the same rule the list column shows, across every sort and order', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, pagingSeeds)
    for (const verdict of ['match', 'mismatch', 'excluded'] as const) {
      const matching = pagingSeeds.filter((seed) => verdictOf(seed) === verdict)
      expect(matching.length).toBeGreaterThan(0)
      for (const sort of ['createdAt', 'confidence'] as const) {
        for (const order of ['asc', 'desc'] as const) {
          // 走査を小さくして、複数バッチにまたがる経路も通す。上限を十分大きくして取りこぼしを無くす。
          for (const scan of [{ batch: 2, maxBatches: 100 }, { batch: 3, maxBatches: 100 }, undefined] as const) {
            for (const limit of [1, 2, 100]) {
              const pages = await walkPages(env, { limit, sort, order, verdict }, scan)
              expect(pages.flat()).toEqual(expectedOrder(matching, sort, order))
              // 一覧の「判定」列の表示と同じ判定になっている。
              const page = await listWebhookJobs(env, { limit: 100, sort, order, verdict }, scan)
              for (const job of page.jobs) expect(webhookKeywordVerdict(job.post)).toBe(verdict)
            }
          }
        }
      }
    }
  })
}, 60000)

test('list verdict: combines with status in SQL, then filters the rest by verdict', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, pagingSeeds)
    await env.DB.prepare("UPDATE webhook_event_jobs SET status='registered' WHERE post_id IN ('9','12')").run()
    const registered = await walkPages(
      env,
      { limit: 5, status: 'registered', verdict: 'match' },
      { batch: 2, maxBatches: 100 }
    )
    expect(registered.flat()).toEqual(
      expectedOrder(
        pagingSeeds.filter((seed) => ['9', '12'].includes(seed.postId) && verdictOf(seed) === 'match'),
        'createdAt',
        'desc'
      )
    )
  })
}, 60000)

test('list verdict: a scan that hits the cap returns an empty page whose cursor continues from the last scanned row', async () => {
  await withRejudgeEnv(async (env) => {
    // 新しい順に 一致 ×1, 不一致 ×7, 一致 ×1。batch 2 × 最大 2 回 = 4 行を走査して打ち切る。
    const seeds = verdictSeeds([
      'match',
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
      'match'
    ])
    await seedListJobs(env, seeds)
    const scan = { batch: 2, maxBatches: 2 }
    const query = { limit: 5, verdict: 'excluded' as const }
    // 除外は 1 件も無い。上限に達しても行は残っているので、0件のまま続きの印(最後に走査した行)を返す。
    const first = await listWebhookJobs(env, query, scan)
    expect(first.jobs).toEqual([])
    expect(first.nextCursor).toBe(seeds[3]?.postId)
    // その印から続けて辿ると、最後は行を使い切って null になる。
    const rest = await walkPages(env, query, scan, first.nextCursor === null ? undefined : first.nextCursor)
    expect(rest.flat()).toEqual([])
    expect(rest.length).toBeGreaterThan(0)

    // 一致の絞り込み: 先頭の 1 件は上限内で見つかり、後ろの 1 件は次ページ以降で見つかる。
    const matchQuery = { limit: 5, verdict: 'match' as const }
    const page1 = await listWebhookJobs(env, matchQuery, scan)
    expect(page1.jobs.map((job) => job.postId)).toEqual([seeds[0]?.postId])
    expect(page1.nextCursor).toBe(seeds[3]?.postId)
    const page2 = await listWebhookJobs(
      env,
      { ...matchQuery, cursor: page1.nextCursor === null ? undefined : page1.nextCursor },
      scan
    )
    expect(page2.jobs).toEqual([])
    expect(page2.nextCursor).toBe(seeds[7]?.postId)
    const page3 = await listWebhookJobs(
      env,
      { ...matchQuery, cursor: page2.nextCursor === null ? undefined : page2.nextCursor },
      scan
    )
    expect(page3.jobs.map((job) => job.postId)).toEqual([seeds[8]?.postId])
    expect(page3.nextCursor).toBeNull()
    // 打ち切りを挟んでも、全ページを連結すれば一致行がすべて順に出る。
    expect((await walkPages(env, matchQuery, scan)).flat()).toEqual([seeds[0]?.postId, seeds[8]?.postId])
  })
}, 60000)

test('list verdict: stops exactly at the limit, and the cursor is the last returned row', async () => {
  await withRejudgeEnv(async (env) => {
    // 新しい順に 一致 ×3 のみ。limit 3 ちょうどで行を使い切る / limit 2 だと続きがある。
    const seeds = verdictSeeds(['match', 'match', 'match'])
    await seedListJobs(env, seeds)
    const scan = { batch: 2, maxBatches: 10 }

    // limit+1 件目が見つかる: 返した最後の行が nextCursor(余分に見つけた行は返さない)。
    const more = await listWebhookJobs(env, { limit: 2, verdict: 'match' }, scan)
    expect(more.jobs.map((job) => job.postId)).toEqual([seeds[0]?.postId, seeds[1]?.postId])
    expect(more.nextCursor).toBe(seeds[1]?.postId)
    const tail = await listWebhookJobs(
      env,
      { limit: 2, verdict: 'match', cursor: more.nextCursor === null ? undefined : more.nextCursor },
      scan
    )
    expect(tail.jobs.map((job) => job.postId)).toEqual([seeds[2]?.postId])
    expect(tail.nextCursor).toBeNull()

    // limit 件ぴったりで行を使い切った: 続きは無いので null。
    const exact = await listWebhookJobs(env, { limit: 3, verdict: 'match' }, scan)
    expect(exact.jobs.map((job) => job.postId)).toEqual(seeds.map((seed) => seed.postId))
    expect(exact.nextCursor).toBeNull()
  })
}, 60000)

test('list verdict: ends with a null cursor when the cap and the last row coincide', async () => {
  await withRejudgeEnv(async (env) => {
    // 4 行を batch 2 × 2 回でちょうど走査し終える。最後のバッチが満杯でも、次の取得は空で null になる。
    const seeds = verdictSeeds(['mismatch', 'mismatch', 'mismatch', 'mismatch'])
    await seedListJobs(env, seeds)
    const result = await listWebhookJobs(env, { limit: 5, verdict: 'match' }, { batch: 2, maxBatches: 2 })
    expect(result.jobs).toEqual([])
    // 上限に達した時点では先があるか分からないので、最後に走査した行を印にする。続きを辿れば null で終わる。
    expect(result.nextCursor).toBe(seeds[3]?.postId)
    const next = await listWebhookJobs(
      env,
      { limit: 5, verdict: 'match', cursor: seeds[3]?.postId },
      { batch: 2, maxBatches: 2 }
    )
    expect(next).toEqual({ jobs: [], nextCursor: null })
  })
}, 60000)

test('list route: validates the new query over HTTP', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    const get = (search: string) => adminWebhookRoutes.request(`/admin/webhook/jobs?${search}`, undefined, env)
    expect((await get('range=7d')).status).toBe(400)
    expect((await get('sort=status')).status).toBe(400)
    expect((await get('verdict=unknown')).status).toBe(400)
    expect((await get('postStatus=foo')).status).toBe(400)
    // ジョブの状態名はステータスの値ではない。
    expect((await get('postStatus=held')).status).toBe(400)
    const ok = await get('sort=confidence&order=asc&postStatus=announce&range=24h')
    expect(ok.status).toBe(200)
    const body = await ok.json()
    expect(body).toMatchObject({ jobs: [], nextCursor: null })
    // ステータスの絞り込みと並びが効く。
    const sorted = await get('limit=100&sort=confidence&order=desc&postStatus=end')
    expect(sorted.status).toBe(200)
    const sortedBody = WebhookJobListSchema.safeParse(await sorted.json())
    expect(sortedBody.success ? sortedBody.data.jobs.map((job) => job.postId) : null).toEqual(
      expectedOrder(postStatusSeedsOf(['13', '14']), 'confidence', 'desc')
    )
    // 精度の下限・上限はもう受け付けない。未知のキーとして捨てるので 400 にならず、絞り込みにも効かない。
    const unfiltered = await get('limit=100')
    const withBounds = await get('limit=100&minConfidence=0.9&maxConfidence=0.1')
    expect(withBounds.status).toBe(200)
    expect(await withBounds.json()).toEqual(await unfiltered.json())
  })
}, 60000)

// ---- 受信履歴のステータス絞り込み ----

/** 保存する回答。ステータス列は、この status の選択肢を表示する。 */
const statusAnswers = (choice: string) =>
  JSON.stringify({
    is_event: { type: 'noul', noul: 0.9 },
    status: { type: 'choice', choice, probabilities: { [choice]: 0.9 } }
  })

/**
 * ステータスの絞り込みを確かめる並び。
 * - 投稿IDの桁数が違う、created_at と confidence の同値、NULL がある（ページ送りの重複・欠落を捉える）。
 * - 却下(ignored)のジョブは保存済み回答が announce でも「却下」にだけ一致する。
 * - 回答が無い・壊れた JSON・JSON でも status が選択式でない・4値にない選択肢の行は、どの4値にも一致しない。
 */
const postStatusSeeds: readonly ListSeed[] = [
  { postId: '9', createdAt: BASE, confidence: 0.5, text: MATCH_TEXT, answersJson: statusAnswers('announce') },
  { postId: '10', createdAt: BASE, confidence: 0.5, text: MISMATCH_TEXT, answersJson: statusAnswers('announce') },
  { postId: '100', createdAt: BASE, confidence: null, text: MATCH_TEXT, answersJson: statusAnswers('start') },
  {
    postId: '1000',
    createdAt: BASE + 1,
    confidence: 0.9,
    text: MATCH_TEXT,
    kind: 'retweet',
    answersJson: statusAnswers('start')
  },
  { postId: '11', createdAt: BASE + 1, confidence: 0.9, text: MISMATCH_TEXT, answersJson: statusAnswers('ongoing') },
  { postId: '12', createdAt: BASE + 2, confidence: 0, text: MATCH_TEXT, answersJson: statusAnswers('ongoing') },
  { postId: '13', createdAt: BASE + 2, confidence: 1, text: MATCH_TEXT, answersJson: statusAnswers('end') },
  {
    postId: '14',
    createdAt: BASE + 3,
    confidence: 0.9,
    text: MISMATCH_TEXT,
    kind: 'retweet',
    answersJson: statusAnswers('end')
  },
  // 却下: 保存済み回答は announce でも、画面のステータスは「却下」。
  {
    postId: '15',
    createdAt: BASE + 3,
    confidence: null,
    text: MATCH_TEXT,
    status: 'ignored',
    answersJson: statusAnswers('announce')
  },
  { postId: '16', createdAt: BASE + 4, confidence: 0.25, text: MATCH_TEXT, status: 'ignored', answersJson: null },
  // 登録済みのジョブでも、回答の選択肢で絞れる。
  {
    postId: '22',
    createdAt: BASE + 4,
    confidence: 0.8,
    text: MATCH_TEXT,
    status: 'registered',
    answersJson: statusAnswers('announce')
  },
  // どの4値にも一致しない行。
  { postId: '17', createdAt: BASE + 5, confidence: 0.5, text: MATCH_TEXT, answersJson: null },
  { postId: '18', createdAt: BASE + 5, confidence: 0.5, text: MATCH_TEXT, answersJson: 'not json{' },
  { postId: '19', createdAt: BASE + 5, confidence: 0.5, text: MATCH_TEXT, answersJson: '[]' },
  { postId: '20', createdAt: BASE + 6, confidence: 0.5, text: MATCH_TEXT, answersJson: '{"status":"announce"}' },
  {
    postId: '21',
    createdAt: BASE + 6,
    confidence: 0.5,
    text: MATCH_TEXT,
    answersJson: JSON.stringify({ status: { type: 'noul', noul: 0.5, choice: 'announce' } })
  },
  { postId: '23', createdAt: BASE + 6, confidence: 0.5, text: MATCH_TEXT, answersJson: statusAnswers('unknown_status') }
]

/** 期待する行の投稿IDを、並びのとおりに seed へ引き直す。 */
const postStatusSeedsOf = (postIds: readonly string[]): ListSeed[] =>
  postStatusSeeds.filter((seed) => postIds.includes(seed.postId))

/** 値ごとに一致するはずの投稿ID。画面の表示とは独立に、シードの内容から固定する。 */
const POST_STATUS_IDS = {
  announce: ['9', '10', '22'],
  start: ['100', '1000'],
  ongoing: ['11', '12'],
  end: ['13', '14'],
  ignored: ['15', '16']
} as const
const POST_STATUSES = ['announce', 'start', 'ongoing', 'end', 'ignored'] as const

test('list postStatus: the seeded answers really include broken rows that would make an unguarded json_extract fail', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    // 保護なしの json_extract は、壊れた JSON の行でエラーになる。だから listFilter は json_valid で守っている。
    await expect(
      env.DB.prepare(
        "SELECT json_extract(answers_json,'$.status.type') AS v FROM webhook_event_jobs WHERE post_id='18'"
      ).all()
    ).rejects.toThrow()
    // 守れば、壊れた行も NULL（どの値にも一致しない）として扱える。
    const guarded = await env.DB.prepare(
      "SELECT post_id AS id, CASE WHEN json_valid(answers_json) THEN json_extract(answers_json,'$.status.type') END AS v FROM webhook_event_jobs WHERE post_id IN ('17','18','19','20')"
    ).all<{ id: string; v: string | null }>()
    expect(guarded.results.map((row) => row.v)).toEqual([null, null, null, null])
  })
}, 60000)

test('list postStatus: each value matches what the status column shows, and ignored wins over the saved answer', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    const all = (await listWebhookJobs(env, { limit: 100 })).jobs
    expect(all).toHaveLength(postStatusSeeds.length)
    for (const postStatus of POST_STATUSES) {
      const expected = POST_STATUS_IDS[postStatus]
      expect(expected.length).toBeGreaterThan(0)
      const page = await listWebhookJobs(env, { limit: 100, postStatus })
      expect(page.jobs.map((job) => job.postId).toSorted()).toEqual(expected.toSorted())
      expect(page.nextCursor).toBeNull()
      // 画面のステータス列の規則（webhookPostStatusLabel）から導いた期待値とも一致する。
      const shown = all
        .filter((job) =>
          postStatus === 'ignored'
            ? job.status === 'ignored'
            : job.status !== 'ignored' && job.postStatus === postStatus
        )
        .map((job) => job.postId)
      expect(page.jobs.map((job) => job.postId).toSorted()).toEqual(shown.toSorted())
    }
    // 却下のジョブは、保存済み回答が announce でも announce には一致しない。
    const announce = (await listWebhookJobs(env, { limit: 100, postStatus: 'announce' })).jobs.map((job) => job.postId)
    expect(announce).not.toContain('15')
    expect(
      (await listWebhookJobs(env, { limit: 100, postStatus: 'ignored' })).jobs.find((job) => job.postId === '15')
    ).toMatchObject({ status: 'ignored', postStatus: 'announce' })
    // 回答が無い・壊れている・status が選択式でない・4値にない選択肢の行は、どの値にも一致せず、エラーにもならない。
    const returned = new Set<string>()
    for (const postStatus of POST_STATUSES) {
      for (const job of (await listWebhookJobs(env, { limit: 100, postStatus })).jobs) returned.add(job.postId)
    }
    for (const postId of ['17', '18', '19', '20', '21', '23']) expect(returned.has(postId)).toBe(false)
    // 絞り込みなしでは、それらの行も含めて全行が返る。
    expect(all.map((job) => job.postId).toSorted()).toEqual(postStatusSeeds.map((seed) => seed.postId).toSorted())
  })
}, 60000)

test('list postStatus: every sort and order pages without duplicates or gaps', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    for (const postStatus of POST_STATUSES) {
      const matching = postStatusSeedsOf(POST_STATUS_IDS[postStatus])
      for (const sort of ['createdAt', 'confidence'] as const) {
        for (const order of ['asc', 'desc'] as const) {
          for (const limit of [1, 2, 100]) {
            const pages = await walkPages(env, { limit, sort, order, postStatus })
            expect(pages.flat()).toEqual(expectedOrder(matching, sort, order))
            for (const page of pages.slice(0, -1)) expect(page).toHaveLength(limit)
          }
        }
      }
    }
  })
}, 60000)

test('list postStatus: combines with verdict, status and range without duplicates or gaps', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    // 判定の走査（複数バッチ）でも、ステータスの条件が SQL 側で効いている。
    for (const postStatus of POST_STATUSES) {
      for (const verdict of ['match', 'mismatch', 'excluded'] as const) {
        const matching = postStatusSeedsOf(POST_STATUS_IDS[postStatus]).filter((seed) => verdictOf(seed) === verdict)
        for (const scan of [{ batch: 2, maxBatches: 100 }, { batch: 3, maxBatches: 100 }, undefined] as const) {
          for (const limit of [1, 2, 100]) {
            for (const sort of ['createdAt', 'confidence'] as const) {
              const pages = await walkPages(env, { limit, sort, order: 'desc', postStatus, verdict }, scan)
              expect(pages.flat()).toEqual(expectedOrder(matching, sort, 'desc'))
            }
          }
        }
      }
    }
    // 少なくとも一つの組は空でなく、複数ページにまたがる（検証が空振りしない）。
    const announceMatch = await walkPages(
      env,
      { limit: 1, postStatus: 'announce', verdict: 'match' },
      { batch: 2, maxBatches: 100 }
    )
    expect(announceMatch.flat()).toEqual(['22', '9'])
    expect(announceMatch.length).toBeGreaterThan(1)
    // ジョブの状態との組み合わせ。登録済みの announce は 22 だけ。
    expect((await walkPages(env, { limit: 1, postStatus: 'announce', status: 'registered' })).flat()).toEqual(['22'])
    expect((await walkPages(env, { limit: 1, postStatus: 'announce', status: 'held' })).flat()).toEqual(
      expectedOrder(postStatusSeedsOf(['9', '10']), 'createdAt', 'desc')
    )
    // 却下はジョブの状態が ignored の行だけ。状態を held にすると重ならない。
    expect(await listWebhookJobs(env, { limit: 100, postStatus: 'ignored', status: 'held' })).toEqual({
      jobs: [],
      nextCursor: null
    })
    // 受信日時の窓と組み合わせても、窓の外の行は出ない（シードは過去なので 1 時間の窓は空）。
    expect(await listWebhookJobs(env, { limit: 100, postStatus: 'announce', range: '1h' })).toEqual({
      jobs: [],
      nextCursor: null
    })
  })
}, 60000)

test('list postStatus: a verdict scan that hits the cap still continues exactly under a postStatus filter', async () => {
  await withRejudgeEnv(async (env) => {
    await seedListJobs(env, postStatusSeeds)
    const scan = { batch: 2, maxBatches: 2 }
    const query = { limit: 5, postStatus: 'announce' as const, verdict: 'match' as const }
    // 打ち切りを挟んでも、辿った結果は上限なしの結果と同じ（重複も欠落も無い）。
    const capped = await walkPages(env, query, scan)
    const uncapped = await walkPages(env, query, { batch: 2, maxBatches: 100 })
    expect(capped.flat()).toEqual(uncapped.flat())
    expect(capped.flat()).toEqual(expectedOrder(postStatusSeedsOf(['9', '22']), 'createdAt', 'desc'))
  })
}, 60000)
