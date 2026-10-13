import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import adminWebhookRoutes from '@api/routes/admin-webhook'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import {
  claimWebhookJob,
  getWebhookJob,
  insertWebhookJob,
  listWebhookJobs,
  registerWebhookEvent
} from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
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

type RejudgeSeed = { status: string; notificationStatus: string; leaseUntil: number | null }
const heldSeed: RejudgeSeed = { status: 'held', notificationStatus: 'failed', leaseUntil: null }

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
      '["needs_review"]',
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

test('rejudge rejects every non-held status with 409 and changes nothing', async () => {
  await withRejudgeEnv(async (env, sent) => {
    const statuses = ['registered', 'ignored', 'failed', 'queued', 'processing']
    for (const [index, status] of statuses.entries()) {
      const postId = await seedRejudgeJob(env, index + 1, { ...heldSeed, status })
      const before = await rawRejudgeRow(env, postId)
      expect(await conflictOf(rejudgeWebhookJob(env, postId))).toEqual({
        status: 409,
        message: 'Only held jobs can be re-judged'
      })
      expect(await rawRejudgeRow(env, postId)).toEqual(before)
    }
    expect(sent).toEqual([])
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
    // 保留でなくなったジョブ、存在しないジョブ、形式の違う ID は再実行できない。
    const again = await request(postId)
    expect(again.status).toBe(409)
    expect(await again.text()).toBe('Only held jobs can be re-judged')
    expect((await request('9999')).status).toBe(404)
    expect((await request('not-a-post-id')).status).toBe(400)
    expect(sent).toEqual([postId])
  })
}, 60000)
