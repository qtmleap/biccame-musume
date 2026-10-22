import type { Bindings } from '@api/types/bindings'
import { type ClefResponse, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { ItemCountAuditSchema } from '@biccame/shared/event-detect/extraction'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { GapStatusSchema } from '@biccame/shared/event-detect/viewer'
import { type EventRequest, EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import {
  type WebhookCandidate,
  WebhookCandidateSchema,
  type WebhookJob,
  WebhookJobSchema
} from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { aggregateWebhookDiscovery } from './webhook-discovery-aggregate'
import { storedWebhookDiscovery } from './webhook-discovery-record'
import { relatedWebhookEvents } from './webhook-related-events'
import { storedWebhookDraft } from './webhook-stored-draft'

export const storedJson = (value: string): unknown => JSON.parse(value)

// 旧保存候補だけに未判定の空配列を補い、新しいAPI入力は必須配列のままにする。
export const StoredEventRequestSchema = EventRequestSchema.extend({
  characterIds: EventRequestSchema.shape.characterIds.default([])
})
const storedEventCandidate = (value: string): EventRequest => {
  const parsed = StoredEventRequestSchema.safeParse(storedJson(value))
  if (!parsed.success) throw new Error('Invalid stored event candidate')
  return parsed.data
}

export type WebhookTarget = {
  table: 'webhook_event_jobs' | 'webhook_event_candidates'
  column: 'post_id' | 'event_uuid'
  id: string
}
export const webhookTarget = (postId: string, candidateId?: string): WebhookTarget =>
  candidateId === undefined
    ? { table: 'webhook_event_jobs', column: 'post_id', id: postId }
    : { table: 'webhook_event_candidates', column: 'event_uuid', id: candidateId }

export const JobColumns = `j.post_id AS postId, j.post_json AS postJson, j.source_url AS sourceUrl, j.event_uuid AS eventUUID,
  j.status, j.reasons_json AS reasonsJson, j.candidate_json AS candidateJson, j.confidence, j.model,
  j.question_version AS questionVersion, j.answers_json AS answersJson, j.result_json AS resultJson, e.title AS eventTitle,
  j.event_id AS eventId, j.attempts, j.notification_status AS notificationStatus, j.notification_id AS notificationId,
  j.notification_error AS notificationError, j.notification_attempts AS notificationAttempts, j.last_error AS lastError,
  j.created_at AS createdAt, j.updated_at AS updatedAt, j.judged_at AS judgedAt`
export const JobTables = 'webhook_event_jobs j LEFT JOIN events e ON e.id=j.event_id'
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
  discovery: true,
  relatedEvents: true,
  createdAt: true,
  updatedAt: true,
  judgedAt: true
}).extend({
  postJson: z.string().nonempty(),
  reasonsJson: z.string().nonempty(),
  candidateJson: z.string().nonempty().nullable(),
  answersJson: z.string().nonempty().nullable(),
  resultJson: z.string().nonempty().nullable().optional(),
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
    candidate: row.candidateJson === null ? null : storedEventCandidate(row.candidateJson),
    confidence: row.confidence,
    model: row.model,
    questionVersion: row.questionVersion,
    eventId: row.eventId,
    eventTitle: row.eventTitle,
    postStatus: postStatus.status,
    postStatusProbability: postStatus.probability,
    answers,
    // 下書きは保留ジョブの保存済み回答から読み取り時に計算する。未保存や破損は null。
    draft: row.status === 'held' && answers !== null ? storedWebhookDraft(post.data, answers) : null,
    discovery: storedWebhookDiscovery(row.resultJson),
    relatedEvents: null,
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
export const storedItemCountAudit = (value: unknown) => {
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
  const job = toJob(row)
  const candidates = await webhookCandidates(env, postId)
  const related = await relatedWebhookEvents(env, job.post)
  const relatedEvents = related.length === 0 ? null : { basis: 'source_reference' as const, events: related }
  return {
    ...job,
    discovery: aggregateWebhookDiscovery(job.discovery, candidates),
    candidates: candidates.map((candidate) => ({ ...candidate, relatedEvents })),
    relatedEvents,
    itemCountAudit: storedItemCountAudit(row.extractionJson)
  }
}
/** 一覧の候補をページ単位で取得し、投稿ごとの並列クエリを発行しない。投稿IDは最大100件。 */
export const webhookCandidatesByPostIds = async (env: Pick<Bindings, 'DB'>, postIds: readonly string[]) => {
  const byPostId = new Map<string, WebhookCandidate[]>(postIds.map((postId) => [postId, []]))
  if (postIds.length === 0) return byPostId
  const rows = await env.DB.prepare(
    `SELECT ${JobColumns},j.item,j.store_key AS storeKey FROM webhook_event_candidates j LEFT JOIN events e ON e.id=j.event_id WHERE j.post_id IN (${postIds.map(() => '?').join(',')}) ORDER BY j.created_at,j.event_uuid`
  )
    .bind(...postIds)
    .all()
  for (const row of rows.results) {
    const candidate = WebhookCandidateSchema.safeParse({ ...toJob(row), item: row.item, storeKey: row.storeKey })
    if (!candidate.success) throw new Error('Invalid stored webhook candidate')
    byPostId.get(candidate.data.postId)?.push(candidate.data)
  }
  return byPostId
}

export const webhookCandidates = async (env: Pick<Bindings, 'DB'>, postId: string) => {
  const byPostId = await webhookCandidatesByPostIds(env, [postId])
  return [...byPostId.values()].flat()
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
