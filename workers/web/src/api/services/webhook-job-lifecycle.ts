import type { Bindings } from '@api/types/bindings'
import { type DetectPost, DetectPostSchema } from '@biccame/shared/event-detect/post'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import { getWebhookJob, webhookCandidates } from './webhook-job-record'

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
