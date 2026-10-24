import {
  enqueueWebhookJob,
  getWebhookCandidate,
  getWebhookJob,
  refreshWebhookJob,
  registerWebhookEvent,
  releaseWebhookJob,
  validateWebhookEvent,
  webhookTarget
} from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import type { WebhookJob, WebhookResolveSchema, WebhookRetrySchema } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

/** 操作の対象を決める。候補を選んでいればその候補、候補が1件ならその候補、候補が無ければ投稿そのもの。複数候補で未指定なら 409。 */
export const actionJob = async (env: Bindings, postId: string, candidateId?: string): Promise<WebhookJob> => {
  const parent = await getWebhookJob(env, postId)
  if (candidateId !== undefined) return getWebhookCandidate(env, postId, candidateId)
  if (parent.candidates.length > 1) throw new HTTPException(409, { message: 'Select a webhook candidate' })
  const first = parent.candidates[0]
  return first === undefined ? parent : { ...first, candidates: [] }
}

export const retryWebhookJob = async (env: Bindings, postId: string, input: z.infer<typeof WebhookRetrySchema>) => {
  const parent = await getWebhookJob(env, postId)
  const job = await actionJob(env, postId, input.candidateId)
  const target = webhookTarget(postId, parent.candidates.length > 0 ? job.eventUUID : undefined)
  if (input.notificationOnly && job.status !== 'held' && job.status !== 'registered')
    throw new HTTPException(409, { message: 'No notification to retry' })
  if (!input.notificationOnly && job.status !== 'failed' && job.status !== 'queued')
    throw new HTTPException(409, { message: 'Only failed jobs can be retried' })
  if (job.notificationStatus === 'unknown' && !input.allowUnknown)
    throw new HTTPException(409, { message: 'Delivery may already have succeeded; explicit confirmation required' })
  if (input.notificationOnly && job.notificationStatus === 'sent')
    throw new HTTPException(409, { message: 'Notification already sent' })
  const now = dayjs().valueOf()
  const parentToken = target.table === 'webhook_event_candidates' ? crypto.randomUUID() : null
  if (parentToken !== null) {
    const lock = await env.DB.prepare(
      'UPDATE webhook_event_jobs SET lease_token=?,lease_until=? WHERE post_id=? AND (lease_until IS NULL OR lease_until<?)'
    )
      .bind(parentToken, now + 300_000, postId, now)
      .run()
    if (lock.meta.changes !== 1) throw new HTTPException(409, { message: 'Job is being processed' })
  }
  try {
    const result = await env.DB.prepare(`UPDATE ${target.table} SET status=?,notification_status=?,
    notification_error=NULL,last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=?
    WHERE ${target.column}=? AND (lease_until IS NULL OR lease_until<?) AND status=? AND notification_status=?
      AND attempts=? AND notification_attempts=?`)
      .bind(
        input.notificationOnly ? job.status : 'queued',
        input.notificationOnly ? 'pending' : job.notificationStatus,
        now,
        target.id,
        now,
        job.status,
        job.notificationStatus,
        job.attempts,
        job.notificationAttempts
      )
      .run()
    if (result.meta.changes !== 1) throw new HTTPException(409, { message: 'Job is being processed' })
    if (parentToken !== null) {
      await refreshWebhookJob(env, postId, parentToken)
      if (!input.notificationOnly)
        await env.DB.prepare("UPDATE webhook_event_jobs SET status='queued' WHERE post_id=? AND lease_token=?")
          .bind(postId, parentToken)
          .run()
    }
  } finally {
    if (parentToken !== null) await releaseWebhookJob(env, postId, parentToken)
  }
  await enqueueWebhookJob(env, postId)
  return getWebhookJob(env, postId)
}

/**
 * 再判定できる行だけを更新対象にする SQL の条件。table は更新対象の表（reasons_json を読む表）。
 * 保留、人が却下していない対象外、手動で連携した登録済み（reasons に manually_linked）が対象。
 * 自動登録された登録済みはパイプラインが作ったイベントを持つため、再判定で重複登録や再通知が起こりうるので含めない。
 */
const rejudgeableRow = (table: 'webhook_event_jobs' | 'webhook_event_candidates') =>
  `(status='held'
    OR (status='ignored' AND NOT EXISTS (SELECT 1 FROM json_each(${table}.reasons_json) WHERE value='manually_rejected'))
    OR (status='registered' AND EXISTS (SELECT 1 FROM json_each(${table}.reasons_json) WHERE value='manually_linked')))`

/**
 * 保留ジョブ、人が却下していない対象外ジョブ、手動で連携した登録済みジョブを再判定に戻す。
 * 保存済みの判定結果と回答を消して queued に戻し、キューへ積み直す。
 * 人が却下したジョブ（reasons に manually_rejected）は再判定で上書きしない。画面側の webhookActionAvailability と同じ規則。
 * 登録済みは reasons に manually_linked があるものだけ。誤った連携を外すため event_id を NULL に戻す（連携先のイベント本体は変更しない）。
 * 自動登録された登録済み（manually_linked なし）は 409 のまま。
 * 処理側は result_json があると Clef を呼ばず再利用するため、消さないと質問の修正が反映されない。
 * 再判定の結果次第でイベントが自動登録され、Discord へ通知（通知済みなら再通知）される場合がある。
 */
export const rejudgeWebhookJob = async (env: Bindings, postId: string, candidateId?: string) => {
  const parent = await getWebhookJob(env, postId)
  const job = await actionJob(env, postId, candidateId)
  if (parent.candidates.length > 0) {
    const manuallyLinked = job.status === 'registered' && job.reasons.includes('manually_linked')
    if (
      (job.status !== 'held' && job.status !== 'ignored' && !manuallyLinked) ||
      job.reasons.includes('manually_rejected')
    ) {
      throw new HTTPException(409, { message: 'Candidate cannot be re-judged' })
    }
    const now = dayjs().valueOf()
    const token = crypto.randomUUID()
    const lock = await env.DB.prepare(
      'UPDATE webhook_event_jobs SET lease_token=?,lease_until=? WHERE post_id=? AND (lease_until IS NULL OR lease_until<?)'
    )
      .bind(token, now + 300_000, postId, now)
      .run()
    if (lock.meta.changes !== 1) throw new HTTPException(409, { message: 'Job is being processed' })
    try {
      const stored = await env.DB.prepare('SELECT extraction_json FROM webhook_event_jobs WHERE post_id=?')
        .bind(postId)
        .first<string>('extraction_json')
      const legacy =
        stored === null
          ? false
          : z.object({ version: z.literal('legacy-single') }).safeParse(JSON.parse(stored)).success
      if (legacy && job.status === 'registered') {
        // 旧形式の登録済みは候補の行を作り直せないため、再判定しない。
        throw new HTTPException(409, { message: 'Candidate cannot be re-judged' })
      }
      if (legacy) {
        const changed = await env.DB.batch([
          env.DB.prepare(
            "DELETE FROM webhook_event_candidates WHERE event_uuid=? AND status IN ('held','ignored') AND (lease_until IS NULL OR lease_until<?)"
          ).bind(job.eventUUID, now),
          env.DB.prepare(
            "UPDATE webhook_event_jobs SET status='queued',extraction_json=NULL,result_json=NULL,answers_json=NULL,requests_json=NULL,candidate_json=NULL,semantic_key=NULL,confidence=NULL,model=NULL,question_version=NULL,judged_at=NULL,last_error=NULL,notification_status='pending',notification_error=NULL,reasons_json='[]',updated_at=? WHERE post_id=? AND lease_token=? AND NOT EXISTS (SELECT 1 FROM webhook_event_candidates WHERE post_id=webhook_event_jobs.post_id)"
          ).bind(now, postId, token)
        ])
        if (changed.at(-1)?.meta.changes !== 1)
          throw new HTTPException(409, { message: 'Candidate is being processed' })
      } else {
        const result =
          await env.DB.prepare(`UPDATE webhook_event_candidates SET status='queued',result_json=NULL,answers_json=NULL,requests_json=NULL,
          candidate_json=NULL,reasons_json='[]',confidence=NULL,model=NULL,question_version=NULL,judged_at=NULL,semantic_key=NULL,
          event_id=CASE WHEN status='registered' THEN NULL ELSE event_id END,
          notification_status='pending',notification_error=NULL,last_error=NULL,updated_at=? WHERE event_uuid=? AND status=? AND attempts=?
          AND notification_attempts=? AND (lease_until IS NULL OR lease_until<?) AND ${rejudgeableRow('webhook_event_candidates')}`)
            .bind(now, job.eventUUID, job.status, job.attempts, job.notificationAttempts, now)
            .run()
        if (result.meta.changes !== 1) throw new HTTPException(409, { message: 'Candidate is being processed' })
        await refreshWebhookJob(env, postId, token)
        await env.DB.prepare("UPDATE webhook_event_jobs SET status='queued' WHERE post_id=? AND lease_token=?")
          .bind(postId, token)
          .run()
      }
    } finally {
      await releaseWebhookJob(env, postId, token)
    }
    await enqueueWebhookJob(env, postId)
    return getWebhookJob(env, postId)
  }
  const manuallyLinked = job.status === 'registered' && job.reasons.includes('manually_linked')
  if (job.status !== 'held' && job.status !== 'ignored' && !manuallyLinked)
    throw new HTTPException(409, { message: 'Only held or ignored jobs can be re-judged' })
  if (job.status === 'ignored' && job.reasons.includes('manually_rejected'))
    throw new HTTPException(409, { message: 'Manually rejected jobs cannot be re-judged' })
  const now = dayjs().valueOf()
  const result =
    await env.DB.prepare(`UPDATE webhook_event_jobs SET status='queued',extraction_json=NULL,result_json=NULL,answers_json=NULL,requests_json=NULL,
    candidate_json=NULL,reasons_json='[]',confidence=NULL,model=NULL,question_version=NULL,judged_at=NULL,
    semantic_key=NULL,event_id=CASE WHEN status='registered' THEN NULL ELSE event_id END,
    notification_status='pending',notification_error=NULL,last_error=NULL,lease_token=NULL,
    lease_until=NULL,updated_at=?
    WHERE post_id=?
      AND ${rejudgeableRow('webhook_event_jobs')}
      AND (lease_until IS NULL OR lease_until<?)
      AND attempts=? AND notification_attempts=?`)
      .bind(now, postId, now, job.attempts, job.notificationAttempts)
      .run()
  if (result.meta.changes !== 1) throw new HTTPException(409, { message: 'Job is being processed' })
  await enqueueWebhookJob(env, postId)
  return getWebhookJob(env, postId)
}

export const resolveWebhookJob = async (env: Bindings, postId: string, input: z.infer<typeof WebhookResolveSchema>) => {
  const parent = await getWebhookJob(env, postId)
  const job = await actionJob(env, postId, input.candidateId)
  const target = webhookTarget(postId, parent.candidates.length > 0 ? job.eventUUID : undefined)
  // 保留以外で許可するのは明示連携だけ。対象外からの連携と、登録済みの連携し直し（付け替え）を許す。登録と却下は保留のみ。
  if (job.status !== 'held' && !(input.action === 'link' && (job.status === 'ignored' || job.status === 'registered')))
    throw new HTTPException(409, { message: 'Job cannot be resolved with this action' })
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
    `UPDATE webhook_event_jobs SET lease_token=?,lease_until=? WHERE post_id=? AND (lease_until IS NULL OR lease_until<?)`
  )
    .bind(token, now + 300_000, postId, now)
    .run()
  if (claimed.meta.changes !== 1) throw new HTTPException(409, { message: 'Job is being processed' })
  try {
    if (target.table === 'webhook_event_candidates') {
      const childClaim = await env.DB.prepare(
        'UPDATE webhook_event_candidates SET lease_token=?,lease_until=? WHERE event_uuid=? AND status=? AND (lease_until IS NULL OR lease_until<?)'
      )
        .bind(token, now + 300_000, target.id, job.status, now)
        .run()
      if (childClaim.meta.changes !== 1) throw new HTTPException(409, { message: 'Candidate is being processed' })
    }
    if (event !== null) await registerWebhookEvent(env, job, event, token, target)
    else {
      const status = input.action === 'link' ? 'registered' : 'ignored'
      const eventId = input.action === 'link' ? input.eventId : null
      const update = env.DB.prepare(
        // 登録済みの連携し直しは通知の状態を変えない（Discord への再通知を起こさない）。右辺の status は更新前の値。
        `UPDATE ${target.table} SET status=?,event_id=?,reasons_json=?,
          notification_status=CASE WHEN status='registered' THEN notification_status ELSE ? END,
          notification_error=CASE WHEN status='registered' THEN notification_error ELSE NULL END,
          updated_at=? WHERE ${target.column}=? AND lease_token=? AND status=?`
      ).bind(
        status,
        eventId,
        JSON.stringify([input.action === 'link' ? 'manually_linked' : 'manually_rejected']),
        input.action === 'link' ? 'pending' : 'skipped',
        now,
        target.id,
        token,
        job.status
      )
      const references =
        input.action === 'link'
          ? [
              env.DB.prepare(`INSERT INTO event_reference_urls (id,event_id,type,url,created_at,updated_at)
          SELECT ?,?,'announce',?,?,? WHERE NOT EXISTS (SELECT 1 FROM event_reference_urls WHERE event_id=? AND url=?)
          AND EXISTS (SELECT 1 FROM ${target.table} WHERE ${target.column}=? AND lease_token=? AND status=?)`).bind(
                crypto.randomUUID(),
                input.eventId,
                job.sourceUrl,
                toD1DateTime(now),
                toD1DateTime(now),
                input.eventId,
                job.sourceUrl,
                target.id,
                token,
                job.status
              )
            ]
          : []
      const result = await env.DB.batch([...references, update])
      if (result.at(-1)?.meta.changes !== 1) throw new HTTPException(409, { message: 'Job lease lost' })
    }
    if (target.table === 'webhook_event_candidates') await refreshWebhookJob(env, postId, token)
  } finally {
    if (target.table === 'webhook_event_candidates')
      await env.DB.prepare(
        'UPDATE webhook_event_candidates SET lease_token=NULL,lease_until=NULL WHERE event_uuid=? AND lease_token=?'
      )
        .bind(target.id, token)
        .run()
    await releaseWebhookJob(env, postId, token)
  }
  if (input.action !== 'reject') await enqueueWebhookJob(env, postId)
  return getWebhookJob(env, postId)
}
