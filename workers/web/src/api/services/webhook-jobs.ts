import { eventSocialSnapshot } from '@api/services/bot-announcement'
import { socialInsertStatements } from '@api/services/social-posting'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { calculateEventStatus } from '@biccame/shared/domain/event-status'
import { type ClefResponse, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { buildDetectionDraft } from '@biccame/shared/event-detect/detection'
import { ItemCountAuditSchema } from '@biccame/shared/event-detect/extraction'
import { type DetectPost, DetectPostSchema } from '@biccame/shared/event-detect/post'
import { GapStatusSchema } from '@biccame/shared/event-detect/viewer'
import { EventDetailSchema, type EventRequest, EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import {
  WebhookCandidateSchema,
  type WebhookJob,
  type WebhookJobQuerySchema,
  WebhookJobSchema
} from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

export const storedJson = (value: string): unknown => JSON.parse(value)

export type WebhookTarget = {
  table: 'webhook_event_jobs' | 'webhook_event_candidates'
  column: 'post_id' | 'event_uuid'
  id: string
}
export const webhookTarget = (postId: string, candidateId?: string): WebhookTarget =>
  candidateId === undefined
    ? { table: 'webhook_event_jobs', column: 'post_id', id: postId }
    : { table: 'webhook_event_candidates', column: 'event_uuid', id: candidateId }

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
  candidates: true,
  reasons: true,
  candidate: true,
  postStatus: true,
  postStatusProbability: true,
  answers: true,
  draft: true,
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
/** 保存済みの回答を読み取る。未判定・破損した原回答は推測せず null にする。 */
const parseStoredAnswers = (value: string | null): ClefResponse['answers'] | null => {
  if (value === null) return null
  try {
    const response = ClefResponseSchema.safeParse({ answers: storedJson(value) })
    return response.success ? response.data.answers : null
  } catch {
    // 未判定・破損した原回答は投稿状態を推測せずに扱う。
    return null
  }
}

const postStatusFromAnswers = (
  answers: ClefResponse['answers'] | null
): { status: WebhookJob['postStatus']; probability: WebhookJob['postStatusProbability'] } => {
  const answer = answers?.status
  if (answer?.type !== 'choice') return { status: null, probability: null }
  const status = GapStatusSchema.safeParse(answer.choice)
  if (!status.success) return { status: null, probability: null }
  const probability = answer.probabilities[answer.choice]
  return { status: status.data, probability: probability === undefined ? null : probability }
}

export const toJob = (value: unknown): WebhookJob => {
  const stored = StoredJobSchema.safeParse(value)
  if (!stored.success) throw new Error('Invalid stored webhook job')
  const row = stored.data
  const post = DetectPostSchema.safeParse(storedJson(row.postJson))
  if (!post.success) throw new Error('Invalid stored webhook job')
  const answers = parseStoredAnswers(row.answersJson)
  const postStatus = postStatusFromAnswers(answers)
  const result = WebhookJobSchema.safeParse({
    postId: row.postId,
    post: post.data,
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
    postStatus: postStatus.status,
    postStatusProbability: postStatus.probability,
    answers,
    // 下書きは保留ジョブの保存済み回答から読み取り時に計算する。未保存や破損は null。
    draft: row.status === 'held' && answers !== null ? buildDetectionDraft(post.data, answers) : null,
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

/** 旧抽出・旧単一候補の保存値には監査を捏造せず、未チェックとして返す。 */
const storedItemCountAudit = (value: unknown) => {
  if (typeof value !== 'string') return null
  try {
    const envelope = storedJson(value)
    const parsed = ItemCountAuditSchema.safeParse(
      typeof envelope === 'object' && envelope !== null && 'itemCountAudit' in envelope
        ? envelope.itemCountAudit
        : undefined
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export const getWebhookJob = async (env: Pick<Bindings, 'DB'>, postId: string): Promise<WebhookJob> => {
  const row = await env.DB.prepare(
    `SELECT ${JobColumns},j.extraction_json AS extractionJson FROM ${JobTables} WHERE j.post_id=?`
  )
    .bind(postId)
    .first()
  if (row === null) throw new HTTPException(404, { message: 'Webhook job not found' })
  const candidates = await webhookCandidates(env, postId)
  return { ...toJob(row), candidates, itemCountAudit: storedItemCountAudit(row.extractionJson) }
}
export const webhookCandidates = async (env: Pick<Bindings, 'DB'>, postId: string) => {
  const rows = await env.DB.prepare(
    `SELECT ${JobColumns},j.item,j.store_key AS storeKey FROM webhook_event_candidates j LEFT JOIN events e ON e.id=j.event_id WHERE j.post_id=? ORDER BY j.created_at,j.event_uuid`
  )
    .bind(postId)
    .all()
  return rows.results.map((row) => {
    const candidate = WebhookCandidateSchema.safeParse({ ...toJob(row), item: row.item, storeKey: row.storeKey })
    if (!candidate.success) throw new Error('Invalid stored webhook candidate')
    return candidate.data
  })
}

export const getWebhookCandidate = async (
  env: Pick<Bindings, 'DB'>,
  postId: string,
  candidateId: string
): Promise<WebhookJob> => {
  const candidate = (await webhookCandidates(env, postId)).find((value) => value.eventUUID === candidateId)
  if (!candidate) throw new HTTPException(404, { message: 'Webhook candidate not found' })
  return { ...candidate, candidates: [] }
}

/** 投稿の集約状態は候補の状態から作る。成功済み候補は保留や再試行で上書きしない。 */
export const refreshWebhookJob = async (env: Pick<Bindings, 'DB'>, postId: string, token?: string) => {
  const candidates = await webhookCandidates(env, postId)
  if (candidates.length === 0) return
  const status = candidates.some((candidate) => candidate.status === 'failed')
    ? 'failed'
    : candidates.some((candidate) => candidate.status === 'queued' || candidate.status === 'processing')
      ? 'processing'
      : candidates.some((candidate) => candidate.status === 'held')
        ? 'held'
        : candidates.some((candidate) => candidate.status === 'registered')
          ? 'registered'
          : 'ignored'
  const notificationStatus = candidates.some((candidate) => candidate.notificationStatus === 'pending')
    ? 'pending'
    : candidates.some((candidate) => candidate.notificationStatus === 'unknown')
      ? 'unknown'
      : candidates.some((candidate) => candidate.notificationStatus === 'failed')
        ? 'failed'
        : candidates.some((candidate) => candidate.notificationStatus === 'sent')
          ? 'sent'
          : 'skipped'
  const first = candidates[0]
  if (!first) return
  const failed = candidates.find((candidate) => candidate.lastError !== null)
  const result =
    await env.DB.prepare(`UPDATE webhook_event_jobs SET status=?,notification_status=?,event_id=?,candidate_json=?,answers_json=?,
    confidence=?,model=?,question_version=?,judged_at=?,reasons_json=?,notification_id=?,notification_error=?,notification_attempts=?,last_error=?,updated_at=? WHERE post_id=? ${token === undefined ? '' : 'AND lease_token=?'}`)
      .bind(
        status,
        notificationStatus,
        first.eventId,
        first.candidate === null ? null : JSON.stringify(first.candidate),
        first.answers === null ? null : JSON.stringify(first.answers),
        first.confidence,
        first.model,
        first.questionVersion,
        first.judgedAt === null ? null : dayjs(first.judgedAt).valueOf(),
        JSON.stringify([...new Set(candidates.flatMap((candidate) => candidate.reasons))]),
        first.notificationId,
        first.notificationError,
        candidates.reduce((sum, candidate) => sum + candidate.notificationAttempts, 0),
        failed === undefined ? null : failed.lastError,
        dayjs().valueOf(),
        postId,
        ...(token === undefined ? [] : [token])
      )
      .run()
  if (result.meta.changes !== 1) throw new Error('Webhook aggregation lease lost')
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
    `SELECT ${JobColumns},j.extraction_json AS extractionJson FROM ${JobTables} ${filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY j.created_at DESC, j.post_id DESC LIMIT ?`
  )
    .bind(...values)
    .all()
  const rows = result.results
  const jobs: WebhookJob[] = await Promise.all(
    rows.slice(0, query.limit).map(async (row) => {
      const job = toJob(row)
      return {
        ...job,
        candidates: await webhookCandidates(env, job.postId),
        itemCountAudit: storedItemCountAudit(row.extractionJson)
      }
    })
  )
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
  env: Pick<Bindings, 'DB' | 'X_POSTING_ENABLED' | 'DISCORD_POSTING_ENABLED'>,
  job: WebhookJob,
  event: EventRequest,
  token: string,
  target: WebhookTarget = webhookTarget(job.postId)
) => {
  const now = dayjs().valueOf()
  // webhook_event_jobs は生SQL専用のミリ秒、イベント系の DateTime 列は Prisma と同じ文字列で保存する。
  const timestamp = toD1DateTime(now)
  const audit = await env.DB.prepare(`SELECT answers_json FROM ${target.table} WHERE ${target.column}=?`)
    .bind(target.id)
    .first<{ answers_json: string | null }>()
  if (audit === null) throw new Error('Webhook job disappeared')
  const predicate = `EXISTS (SELECT 1 FROM ${target.table} WHERE ${target.column}=? AND lease_token=? AND status IN ('processing','held'))`
  const statements = [
    env.DB.prepare(`INSERT INTO events
    (id,category,title,limited_quantity,start_date,end_date,ended_at,is_verified,is_preliminary,group_id,character_id,
    clef_confidence,clef_model,clef_version,clef_post_id,clef_answers,clef_judged_at,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,? WHERE ${predicate}`).bind(
      event.uuid,
      event.category,
      event.title,
      event.limitedQuantity === undefined ? null : event.limitedQuantity,
      toD1DateTime(event.startDate),
      event.endDate === undefined ? null : toD1DateTime(event.endDate),
      event.endedAt === undefined ? null : toD1DateTime(event.endedAt),
      event.isPreliminary ? 1 : 0,
      event.groupId === undefined ? null : event.groupId,
      event.characterId === undefined ? null : event.characterId,
      job.confidence,
      job.model,
      job.questionVersion,
      job.postId,
      audit.answers_json,
      job.judgedAt === null ? null : toD1DateTime(job.judgedAt),
      timestamp,
      timestamp,
      target.id,
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
        timestamp,
        timestamp,
        target.id,
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
        timestamp,
        timestamp,
        target.id,
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
        timestamp,
        timestamp,
        target.id,
        token,
        event.uuid,
        job.postId
      )
    )
  )
  const detail = EventDetailSchema.safeParse({
    ...event,
    createdAt: now,
    updatedAt: now,
    ...calculateEventStatus(event, dayjs(now).toISOString()),
    interestedCount: 0,
    completedCount: 0,
    comments: []
  })
  if (!detail.success) throw new Error('Invalid registered event snapshot')
  statements.push(
    ...socialInsertStatements(env, eventSocialSnapshot(detail.data, 'created'), `WHERE ${guard}`, [
      target.id,
      token,
      event.uuid,
      job.postId
    ])
  )
  statements.push(
    env.DB.prepare(`UPDATE ${target.table} SET status='registered',event_id=?,candidate_json=?,
    notification_status='pending',last_error=NULL,updated_at=? WHERE ${target.column}=? AND lease_token=?
    AND EXISTS (SELECT 1 FROM events WHERE id=? AND clef_post_id=?)`).bind(
      event.uuid,
      JSON.stringify(event),
      now,
      target.id,
      token,
      event.uuid,
      job.postId
    )
  )
  const results = await env.DB.batch(statements)
  if (results.at(-1)?.meta.changes !== 1) throw new Error('Webhook registration lease lost')
}

export const webhookItemIdentity = (item: string) =>
  item
    .normalize('NFKC')
    .replace(/キーホルダ[―−ｰ]/g, 'キーホルダー')
    .replace(/\s+/g, '')
export const webhookConditionIdentity = (event: EventRequest) =>
  JSON.stringify(
    event.conditions
      .map(({ type, purchaseAmount, quantity }) => [type, purchaseAmount, quantity])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  )

export const duplicateWebhookEvents = async (env: Bindings, event: EventRequest, sourceUrl: string, item?: string) => {
  const placeholders = event.stores.map(() => '?').join(',')
  const rows = await env.DB.prepare(`SELECT e.id,c.item,c.candidate_json AS candidateJson,
    CASE WHEN json_valid(j.extraction_json) AND json_extract(j.extraction_json,'$.version')='legacy-single' THEN 1 ELSE 0 END AS legacy
    FROM events e LEFT JOIN webhook_event_candidates c ON c.event_id=e.id
    LEFT JOIN webhook_event_jobs j ON j.post_id=c.post_id WHERE e.id<>? AND (
    EXISTS (SELECT 1 FROM event_reference_urls r WHERE r.event_id=e.id AND r.url=?) OR
    (e.category=? AND e.start_date=? AND EXISTS (SELECT 1 FROM event_stores s WHERE s.event_id=e.id AND s.store_key IN (${placeholders}))))`)
    .bind(event.uuid, sourceUrl, event.category, toD1DateTime(event.startDate), ...event.stores)
    .all<{ id: string; item: string | null; candidateJson: string | null; legacy: number }>()
  return [
    ...new Set(
      rows.results
        .filter((row) => {
          if (item === undefined || row.item === null) return true
          const stored =
            row.candidateJson === null ? undefined : EventRequestSchema.safeParse(storedJson(row.candidateJson))
          if (stored === undefined || !stored.success)
            return (
              row.legacy === 1 ||
              row.item === '既存配布物' ||
              webhookItemIdentity(row.item) === webhookItemIdentity(item)
            )
          // 旧形式のitemは生成タイトルであり、抽出名とは一致しない。移行の印を持つ行だけは項目の一致で照合する。
          return (
            (row.legacy === 1 || webhookItemIdentity(row.item) === webhookItemIdentity(item)) &&
            stored.data.category === event.category &&
            stored.data.startDate.slice(0, 10) === event.startDate.slice(0, 10) &&
            stored.data.stores.slice().sort().join(',') === event.stores.slice().sort().join(',') &&
            webhookConditionIdentity(stored.data) === webhookConditionIdentity(event)
          )
        })
        .map((row) => row.id)
    )
  ]
}
