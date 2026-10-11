import type { Bindings } from '@api/types/bindings'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { type DetectPost, DetectPostSchema } from '@biccame/shared/event-detect/post'
import { GapStatusSchema } from '@biccame/shared/event-detect/viewer'
import { type EventRequest, EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import { type WebhookJob, type WebhookJobQuerySchema, WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

export const storedJson = (value: string): unknown => JSON.parse(value)

const JobColumns = `j.post_id AS postId, j.post_json AS postJson, j.source_url AS sourceUrl, j.event_uuid AS eventUUID,
  j.status, j.reasons_json AS reasonsJson, j.candidate_json AS candidateJson, j.confidence, j.model,
  j.question_version AS questionVersion, j.answers_json AS answersJson, e.title AS eventTitle,
  j.event_id AS eventId, j.attempts, j.notification_status AS notificationStatus, j.notification_id AS notificationId,
  j.notification_error AS notificationError, j.notification_attempts AS notificationAttempts, j.last_error AS lastError,
  j.created_at AS createdAt, j.updated_at AS updatedAt, j.judged_at AS judgedAt`
const JobTables = 'webhook_event_jobs j LEFT JOIN events e ON e.id=j.event_id'
const TimestampSchema = z.union([z.number(), z.string().nonempty()])
const StoredJobSchema = WebhookJobSchema.omit({
  post: true,
  reasons: true,
  candidate: true,
  postStatus: true,
  createdAt: true,
  updatedAt: true,
  judgedAt: true
}).extend({
  postJson: z.string().nonempty(),
  reasonsJson: z.string().nonempty(),
  candidateJson: z.string().nonempty().nullable(),
  answersJson: z.string().nonempty().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  judgedAt: TimestampSchema.nullable()
})
const postStatusFromAnswers = (value: string | null): WebhookJob['postStatus'] => {
  if (value === null) return null
  try {
    const response = ClefResponseSchema.safeParse({ answers: storedJson(value) })
    if (!response.success) return null
    const answer = response.data.answers.status
    if (answer?.type !== 'choice') return null
    const status = GapStatusSchema.safeParse(answer.choice)
    return status.success ? status.data : null
  } catch {
    // 未判定・破損した原回答は投稿状態を推測せずに扱う。
    return null
  }
}

const toJob = (value: unknown): WebhookJob => {
  const stored = StoredJobSchema.safeParse(value)
  if (!stored.success) throw new Error('Invalid stored webhook job')
  const row = stored.data
  const result = WebhookJobSchema.safeParse({
    postId: row.postId,
    post: storedJson(row.postJson),
    sourceUrl: row.sourceUrl,
    eventUUID: row.eventUUID,
    status: row.status,
    reasons: storedJson(row.reasonsJson),
    candidate: row.candidateJson === null ? null : storedJson(row.candidateJson),
    confidence: row.confidence,
    model: row.model,
    questionVersion: row.questionVersion,
    eventId: row.eventId,
    eventTitle: row.eventTitle,
    postStatus: postStatusFromAnswers(row.answersJson),
    attempts: row.attempts,
    notificationStatus: row.notificationStatus,
    notificationId: row.notificationId,
    notificationError: row.notificationError,
    notificationAttempts: row.notificationAttempts,
    lastError: row.lastError,
    createdAt: dayjs(row.createdAt).toISOString(),
    updatedAt: dayjs(row.updatedAt).toISOString(),
    judgedAt: row.judgedAt === null ? null : dayjs(row.judgedAt).toISOString()
  })
  if (!result.success) throw new Error('Invalid stored webhook job')
  return result.data
}

export const getWebhookJob = async (env: Pick<Bindings, 'DB'>, postId: string): Promise<WebhookJob> => {
  const row = await env.DB.prepare(`SELECT ${JobColumns} FROM ${JobTables} WHERE j.post_id=?`).bind(postId).first()
  if (row === null) throw new HTTPException(404, { message: 'Webhook job not found' })
  return toJob(row)
}
export const listWebhookJobs = async (env: Pick<Bindings, 'DB'>, query: z.infer<typeof WebhookJobQuerySchema>) => {
  const filters = [
    ...(query.status ? ['j.status=?'] : []),
    ...(query.cursor
      ? [
          '(j.created_at < (SELECT created_at FROM webhook_event_jobs WHERE post_id=?) OR (j.created_at = (SELECT created_at FROM webhook_event_jobs WHERE post_id=?) AND j.post_id<?))'
        ]
      : [])
  ]
  const values = [
    ...(query.status ? [query.status] : []),
    ...(query.cursor ? [query.cursor, query.cursor, query.cursor] : []),
    query.limit + 1
  ]
  const result = await env.DB.prepare(
    `SELECT ${JobColumns} FROM ${JobTables} ${filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY j.created_at DESC, j.post_id DESC LIMIT ?`
  )
    .bind(...values)
    .all()
  const rows = result.results
  const jobs = rows.slice(0, query.limit).map(toJob)
  const last = jobs.at(-1)
  return { jobs, nextCursor: rows.length > query.limit && last ? last.postId : null }
}
export const insertWebhookJob = async (env: Pick<Bindings, 'DB'>, post: DetectPost, ignoredReason?: string) => {
  const parsed = DetectPostSchema.safeParse(post)
  if (!parsed.success) throw new Error('Invalid normalized webhook post')
  const now = dayjs().valueOf()
  await env.DB.prepare(`INSERT INTO webhook_event_jobs
    (post_id,post_json,source_url,event_uuid,status,reasons_json,notification_status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO NOTHING`)
    .bind(
      post.id,
      JSON.stringify(parsed.data),
      post.url,
      crypto.randomUUID(),
      ignoredReason ? 'ignored' : 'queued',
      JSON.stringify(ignoredReason ? [ignoredReason] : []),
      ignoredReason ? 'skipped' : 'pending',
      now,
      now
    )
    .run()
  const job = await getWebhookJob(env, post.id)
  if (job.post.text !== post.text || job.post.screenName.toLowerCase() !== post.screenName.toLowerCase()) {
    throw new HTTPException(400, { message: 'Conflicting webhook post' })
  }
  return job
}
export const enqueueWebhookJob = async (env: Bindings, postId: string, delaySeconds = 0) => {
  try {
    if (!env.EVENT_DETECTION_QUEUE) throw new Error('Webhook queue unavailable')
    await env.EVENT_DETECTION_QUEUE.send({ postId }, delaySeconds > 0 ? { delaySeconds } : {})
  } catch {
    await env.DB.prepare(`UPDATE webhook_event_jobs SET status=CASE WHEN status='queued' THEN 'failed' ELSE status END,
      last_error='queue_send_failed',updated_at=? WHERE post_id=?`)
      .bind(dayjs().valueOf(), postId)
      .run()
    throw new HTTPException(503, { message: 'Webhook queue unavailable' })
  }
}
export const claimWebhookJob = async (env: Bindings, postId: string) => {
  const token = crypto.randomUUID()
  const now = dayjs().valueOf()
  const result = await env.DB.prepare(`UPDATE webhook_event_jobs SET lease_token=?,lease_until=?,
    attempts=attempts+1,updated_at=?,last_error=NULL, status=CASE WHEN status IN ('queued','failed') THEN 'processing' ELSE status END
    WHERE post_id=? AND (lease_until IS NULL OR lease_until<?)
    AND (status IN ('queued','processing','failed') OR (status IN ('held','registered') AND notification_status='pending'))`)
    .bind(token, now + 300_000, now, postId, now)
    .run()
  return result.meta.changes === 1 ? token : null
}
export const releaseWebhookJob = async (env: Bindings, postId: string, token: string) => {
  await env.DB.prepare(
    'UPDATE webhook_event_jobs SET lease_token=NULL,lease_until=NULL WHERE post_id=? AND lease_token=?'
  )
    .bind(postId, token)
    .run()
}

const EventDateInputSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })])
const validEventDate = (value: string) =>
  EventDateInputSchema.safeParse(value).success && dayjs(value.slice(0, 10)).format('YYYY-MM-DD') === value.slice(0, 10)

export const validateWebhookEvent = (value: unknown, eventUUID: string): EventRequest => {
  const parsed = EventRequestSchema.safeParse(value)
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid event data' })
  const event = parsed.data
  if (
    event.uuid !== eventUUID ||
    !validEventDate(event.startDate) ||
    (event.endDate !== undefined &&
      (!validEventDate(event.endDate) || dayjs(event.endDate).isBefore(dayjs(event.startDate)))) ||
    (event.endedAt !== undefined &&
      (!validEventDate(event.endedAt) || dayjs(event.endedAt).isBefore(dayjs(event.startDate)))) ||
    (event.limitedQuantity !== undefined && !Number.isSafeInteger(event.limitedQuantity)) ||
    event.conditions.some(
      (condition) =>
        (condition.type === 'purchase' && condition.purchaseAmount === undefined) ||
        (condition.purchaseAmount !== undefined && !Number.isSafeInteger(condition.purchaseAmount)) ||
        (condition.quantity !== undefined && !Number.isSafeInteger(condition.quantity))
    )
  ) {
    throw new HTTPException(400, { message: 'Incomplete event data' })
  }
  return {
    ...event,
    startDate: event.startDate.length === 10 ? `${event.startDate}T00:00:00+09:00` : event.startDate,
    ...(event.endDate
      ? { endDate: event.endDate.length === 10 ? `${event.endDate}T23:59:59+09:00` : event.endDate }
      : {}),
    ...(event.endedAt
      ? { endedAt: event.endedAt.length === 10 ? `${event.endedAt}T23:59:59+09:00` : event.endedAt }
      : {}),
    isVerified: true,
    shouldTweet: false
  }
}

/** 判定履歴とイベント・子テーブルをD1の同一トランザクションで確定する。 */
export const registerWebhookEvent = async (
  env: Pick<Bindings, 'DB'>,
  job: WebhookJob,
  event: EventRequest,
  token: string
) => {
  const now = dayjs().valueOf()
  const audit = await env.DB.prepare('SELECT answers_json FROM webhook_event_jobs WHERE post_id=?')
    .bind(job.postId)
    .first<{ answers_json: string | null }>()
  if (audit === null) throw new Error('Webhook job disappeared')
  const predicate =
    "EXISTS (SELECT 1 FROM webhook_event_jobs WHERE post_id=? AND lease_token=? AND status IN ('processing','held'))"
  const statements = [
    env.DB.prepare(`INSERT INTO events
    (id,category,title,limited_quantity,start_date,end_date,ended_at,is_verified,is_preliminary,group_id,character_id,
    clef_confidence,clef_model,clef_version,clef_post_id,clef_answers,clef_judged_at,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,? WHERE ${predicate}`).bind(
      event.uuid,
      event.category,
      event.title,
      event.limitedQuantity === undefined ? null : event.limitedQuantity,
      dayjs(event.startDate).valueOf(),
      event.endDate === undefined ? null : dayjs(event.endDate).valueOf(),
      event.endedAt === undefined ? null : dayjs(event.endedAt).valueOf(),
      event.isPreliminary ? 1 : 0,
      event.groupId === undefined ? null : event.groupId,
      event.characterId === undefined ? null : event.characterId,
      job.confidence,
      job.model,
      job.questionVersion,
      job.postId,
      audit.answers_json,
      job.judgedAt === null ? null : dayjs(job.judgedAt).valueOf(),
      now,
      now,
      job.postId,
      token
    )
  ]
  const guard = `${predicate} AND EXISTS (SELECT 1 FROM events WHERE id=? AND clef_post_id=?)`
  statements.push(
    ...event.conditions.map((condition) =>
      env.DB.prepare(`INSERT INTO event_conditions
    (id,event_id,type,purchase_amount,quantity,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`).bind(
        condition.uuid,
        event.uuid,
        condition.type,
        condition.purchaseAmount === undefined ? null : condition.purchaseAmount,
        condition.quantity === undefined ? null : condition.quantity,
        now,
        now,
        job.postId,
        token,
        event.uuid,
        job.postId
      )
    )
  )
  statements.push(
    ...event.referenceUrls.map((reference) =>
      env.DB.prepare(`INSERT INTO event_reference_urls
    (id,event_id,type,url,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(
        reference.uuid,
        event.uuid,
        reference.type,
        reference.url,
        now,
        now,
        job.postId,
        token,
        event.uuid,
        job.postId
      )
    )
  )
  statements.push(
    ...event.stores.map((store) =>
      env.DB.prepare(`INSERT INTO event_stores
    (id,event_id,store_key,created_at,updated_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(
        crypto.randomUUID(),
        event.uuid,
        store,
        now,
        now,
        job.postId,
        token,
        event.uuid,
        job.postId
      )
    )
  )
  statements.push(
    env.DB.prepare(`UPDATE webhook_event_jobs SET status='registered',event_id=?,candidate_json=?,
    notification_status='pending',last_error=NULL,updated_at=? WHERE post_id=? AND lease_token=?
    AND EXISTS (SELECT 1 FROM events WHERE id=? AND clef_post_id=?)`).bind(
      event.uuid,
      JSON.stringify(event),
      now,
      job.postId,
      token,
      event.uuid,
      job.postId
    )
  )
  const results = await env.DB.batch(statements)
  if (results.at(-1)?.meta.changes !== 1) throw new Error('Webhook registration lease lost')
}

export const duplicateWebhookEvents = async (env: Bindings, event: EventRequest, sourceUrl: string) => {
  const placeholders = event.stores.map(() => '?').join(',')
  const rows = await env.DB.prepare(`SELECT e.id FROM events e WHERE
    EXISTS (SELECT 1 FROM event_reference_urls r WHERE r.event_id=e.id AND r.url=?) OR
    (e.category=? AND e.start_date=? AND EXISTS (SELECT 1 FROM event_stores s WHERE s.event_id=e.id AND s.store_key IN (${placeholders}))) LIMIT 10`)
    .bind(sourceUrl, event.category, dayjs(event.startDate).valueOf(), ...event.stores)
    .all<{ id: string }>()
  return rows.results.map((row) => row.id)
}
