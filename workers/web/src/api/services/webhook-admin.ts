import {
  enqueueWebhookJob,
  getWebhookJob,
  registerWebhookEvent,
  releaseWebhookJob,
  validateWebhookEvent
} from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import type { WebhookResolveSchema, WebhookRetrySchema } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

export const retryWebhookJob = async (env: Bindings, postId: string, input: z.infer<typeof WebhookRetrySchema>) => {
  const job = await getWebhookJob(env, postId)
  if (input.notificationOnly && job.status !== 'held' && job.status !== 'registered')
    throw new HTTPException(409, { message: 'No notification to retry' })
  if (!input.notificationOnly && job.status !== 'failed' && job.status !== 'queued')
    throw new HTTPException(409, { message: 'Only failed jobs can be retried' })
  if (job.notificationStatus === 'unknown' && !input.allowUnknown)
    throw new HTTPException(409, { message: 'Delivery may already have succeeded; explicit confirmation required' })
  if (input.notificationOnly && job.notificationStatus === 'sent')
    throw new HTTPException(409, { message: 'Notification already sent' })
  const now = dayjs().valueOf()
  const result = await env.DB.prepare(`UPDATE webhook_event_jobs SET status=?,notification_status=?,
    notification_error=NULL,last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=?
    WHERE post_id=? AND (lease_until IS NULL OR lease_until<?) AND status=? AND notification_status=?
      AND attempts=? AND notification_attempts=?`)
    .bind(
      input.notificationOnly ? job.status : 'queued',
      input.notificationOnly ? 'pending' : job.notificationStatus,
      now,
      postId,
      now,
      job.status,
      job.notificationStatus,
      job.attempts,
      job.notificationAttempts
    )
    .run()
  if (result.meta.changes !== 1) throw new HTTPException(409, { message: 'Job is being processed' })
  await enqueueWebhookJob(env, postId)
  return getWebhookJob(env, postId)
}

/**
 * 保留ジョブを再判定に戻す。保存済みの判定結果と回答を消して queued に戻し、キューへ積み直す。
 * 処理側は result_json があると Clef を呼ばず再利用するため、消さないと質問の修正が反映されない。
 * 通知はやり直しになるため、Discord へ再度通知される場合がある。
 */
export const rejudgeWebhookJob = async (env: Bindings, postId: string) => {
  const job = await getWebhookJob(env, postId)
  if (job.status !== 'held') throw new HTTPException(409, { message: 'Only held jobs can be re-judged' })
  const now = dayjs().valueOf()
  const result = await env.DB.prepare(`UPDATE webhook_event_jobs SET status='queued',result_json=NULL,answers_json=NULL,
    candidate_json=NULL,reasons_json='[]',confidence=NULL,model=NULL,question_version=NULL,judged_at=NULL,
    semantic_key=NULL,notification_status='pending',notification_error=NULL,last_error=NULL,lease_token=NULL,
    lease_until=NULL,updated_at=?
    WHERE post_id=? AND status='held' AND (lease_until IS NULL OR lease_until<?)
      AND attempts=? AND notification_attempts=?`)
    .bind(now, postId, now, job.attempts, job.notificationAttempts)
    .run()
  if (result.meta.changes !== 1) throw new HTTPException(409, { message: 'Job is being processed' })
  await enqueueWebhookJob(env, postId)
  return getWebhookJob(env, postId)
}

export const resolveWebhookJob = async (env: Bindings, postId: string, input: z.infer<typeof WebhookResolveSchema>) => {
  const job = await getWebhookJob(env, postId)
  if (job.status !== 'held') throw new HTTPException(409, { message: 'Only held jobs can be resolved' })
  const event = input.action === 'register' ? validateWebhookEvent(input.event, job.eventUUID) : null
  if (
    input.action === 'link' &&
    (await env.DB.prepare('SELECT id FROM events WHERE id=?').bind(input.eventId).first()) === null
  ) {
    throw new HTTPException(404, { message: 'Event not found' })
  }
  const token = crypto.randomUUID()
  const now = dayjs().valueOf()
  const claimed = await env.DB.prepare(
    `UPDATE webhook_event_jobs SET lease_token=?,lease_until=? WHERE post_id=? AND status='held' AND (lease_until IS NULL OR lease_until<?)`
  )
    .bind(token, now + 300_000, postId, now)
    .run()
  if (claimed.meta.changes !== 1) throw new HTTPException(409, { message: 'Job is being processed' })
  try {
    if (event !== null) await registerWebhookEvent(env, job, event, token)
    else {
      const status = input.action === 'link' ? 'registered' : 'ignored'
      const eventId = input.action === 'link' ? input.eventId : null
      const update = env.DB.prepare(
        `UPDATE webhook_event_jobs SET status=?,event_id=?,reasons_json=?,notification_status=?,notification_error=NULL,updated_at=? WHERE post_id=? AND lease_token=? AND status='held'`
      ).bind(
        status,
        eventId,
        JSON.stringify([input.action === 'link' ? 'manually_linked' : 'manually_rejected']),
        input.action === 'link' ? 'pending' : 'skipped',
        now,
        postId,
        token
      )
      const references =
        input.action === 'link'
          ? [
              env.DB.prepare(`INSERT INTO event_reference_urls (id,event_id,type,url,created_at,updated_at)
          SELECT ?,?,'announce',?,?,? WHERE NOT EXISTS (SELECT 1 FROM event_reference_urls WHERE event_id=? AND url=?)
          AND EXISTS (SELECT 1 FROM webhook_event_jobs WHERE post_id=? AND lease_token=? AND status='held')`).bind(
                crypto.randomUUID(),
                input.eventId,
                job.sourceUrl,
                toD1DateTime(now),
                toD1DateTime(now),
                input.eventId,
                job.sourceUrl,
                postId,
                token
              )
            ]
          : []
      const result = await env.DB.batch([...references, update])
      if (result.at(-1)?.meta.changes !== 1) throw new HTTPException(409, { message: 'Job lease lost' })
    }
  } finally {
    await releaseWebhookJob(env, postId, token)
  }
  if (input.action !== 'reject') await enqueueWebhookJob(env, postId)
  return getWebhookJob(env, postId)
}
