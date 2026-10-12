import { notifyEventDetection } from '@api/services/discord'
import { getEvent } from '@api/services/event-service'
import { exhaustSocialJob, processSocialJob } from '@api/services/social-posting'
import { detectionConfiguration } from '@api/services/webhook-config'
import {
  claimWebhookJob,
  duplicateWebhookEvents,
  getWebhookJob,
  registerWebhookEvent,
  releaseWebhookJob,
  storedJson,
  validateWebhookEvent
} from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import { discordDeliveryResultSchema, type EventDetectionNotification } from '@biccame/shared/bot'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import {
  createDetectionRequest,
  DETECTION_VERSION,
  type DetectionCandidate,
  DetectionResultSchema,
  evaluateDetection
} from '@biccame/shared/event-detect/detection'
import { EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import { type WebhookJob, WebhookQueueMessageSchema } from '@biccame/shared/schemas/webhook.dto'
import { SocialQueueMessageSchema } from '@biccame/shared/social'
import { botStores } from '@biccame/shared/stores'
import dayjs from 'dayjs'

const siteOrigin = (env: Bindings) =>
  env.ENVIRONMENT === 'prod'
    ? 'https://biccame-musume.com'
    : env.ENVIRONMENT === 'dev'
      ? 'https://dev.biccame-musume.com'
      : 'http://localhost:15175'
const eventCandidate = (candidate: DetectionCandidate, uuid: string) => {
  const value = {
    ...candidate,
    uuid,
    startDate: `${candidate.startDate}T00:00:00+09:00`,
    ...(candidate.endDate ? { endDate: `${candidate.endDate}T23:59:59+09:00` } : {}),
    conditions: candidate.conditions.map((condition) => ({ ...condition, uuid: crypto.randomUUID() })),
    referenceUrls: candidate.referenceUrls.map((reference) => ({ ...reference, uuid: crypto.randomUUID() })),
    isVerified: true,
    shouldTweet: false
  }
  const parsed = EventRequestSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

const detectionDeadline = async <T>(task: Promise<T>): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('Detection timed out')), { once: true })
  })
  try {
    return await Promise.race([task, deadline])
  } finally {
    clearTimeout(timer)
  }
}

class NotificationRetry extends Error {
  readonly delay: number
  constructor(delay: number) {
    super('Notification retry required')
    this.delay = delay
  }
}

export const notifyWebhookJob = async (env: Bindings, job: WebhookJob, token: string): Promise<void> => {
  if ((job.status !== 'held' && job.status !== 'registered') || job.notificationStatus !== 'pending') return
  const candidate = job.candidate
  const eventId = job.eventId
  const registered = job.status === 'registered' && eventId !== null ? await getEvent(env, eventId) : null
  const common = {
    requestId: job.eventUUID,
    postId: job.postId,
    postUrl: job.sourceUrl,
    managementUrl: `${siteOrigin(env)}/admin/webhooks/${job.postId}`,
    text: job.post.text,
    confidence: job.confidence === null ? 0 : job.confidence,
    reasons: job.reasons.slice(0, 20).map((reason) => reason.slice(0, 500)),
    stores: (registered
      ? registered.stores
      : candidate
        ? candidate.stores
        : botStores
            .filter((store) => store.twitter_id.toLowerCase() === job.post.screenName.toLowerCase())
            .map((store) => store.id)
    )
      .slice(0, 20)
      .map((id) => {
        const store = botStores.find((value) => value.id === id)
        return store ? store.name : id
      })
  }
  const input: EventDetectionNotification =
    registered !== null && eventId !== null
      ? {
          ...common,
          status: 'registered',
          event: {
            title: registered.title.slice(0, 300),
            url: `${siteOrigin(env)}/events/${eventId}`,
            category: registered.category,
            startDate: dayjs(registered.startDate).toISOString(),
            ...(registered.endDate ? { endDate: dayjs(registered.endDate).toISOString() } : {}),
            conditions: registered.conditions.map(
              (condition) =>
                `${condition.type}${condition.purchaseAmount === undefined ? '' : ` ${condition.purchaseAmount}円`}${condition.quantity === undefined ? '' : ` ${condition.quantity}名`}`
            )
          }
        }
      : { ...common, status: 'held' }
  // 送信開始を先に記録する。結果保存前に停止した場合の盲目的再送を防ぐ。
  const started = await env.DB.prepare(`UPDATE webhook_event_jobs SET notification_status='unknown',
    notification_error='delivery_in_progress',notification_attempts=notification_attempts+1,updated_at=?
    WHERE post_id=? AND lease_token=? AND notification_status='pending'`)
    .bind(dayjs().valueOf(), job.postId, token)
    .run()
  if (started.meta.changes !== 1) return
  try {
    const raw = await notifyEventDetection(env, input)
    const parsed = discordDeliveryResultSchema.safeParse(raw)
    if (!parsed.success) throw new Error('Invalid Discord RPC response')
    const result = parsed.data
    const retryDelay =
      result.status === 'failed' && result.kind === 'rate_limit' && result.retryAfterSeconds !== undefined
        ? Math.ceil(result.retryAfterSeconds)
        : null
    const status =
      result.status === 'sent'
        ? 'sent'
        : result.status === 'unknown'
          ? 'unknown'
          : retryDelay !== null
            ? 'pending'
            : 'failed'
    const error = result.status === 'sent' ? null : result.kind
    await env.DB.prepare(
      `UPDATE webhook_event_jobs SET notification_status=?,notification_id=?,notification_error=?,updated_at=? WHERE post_id=? AND lease_token=?`
    )
      .bind(status, result.status === 'sent' ? result.messageId : null, error, dayjs().valueOf(), job.postId, token)
      .run()
    if (retryDelay !== null) throw new NotificationRetry(retryDelay)
  } catch (error) {
    if (error instanceof NotificationRetry) throw error
    await env.DB.prepare(
      `UPDATE webhook_event_jobs SET notification_status='unknown',notification_error='delivery_unknown',updated_at=? WHERE post_id=? AND lease_token=?`
    )
      .bind(dayjs().valueOf(), job.postId, token)
      .run()
  }
}

export const processWebhookJob = async (env: Bindings, postId: string): Promise<number | null> => {
  const token = await claimWebhookJob(env, postId)
  if (token === null) {
    const job = await getWebhookJob(env, postId)
    const waiting =
      job.status === 'processing' ||
      job.status === 'queued' ||
      job.status === 'failed' ||
      ((job.status === 'held' || job.status === 'registered') && job.notificationStatus === 'pending')
    if (!waiting) return null
    const lease = await env.DB.prepare('SELECT lease_until FROM webhook_event_jobs WHERE post_id=?')
      .bind(postId)
      .first<number>('lease_until')
    return lease === null ? 30 : Math.max(1, Math.ceil((lease - dayjs().valueOf()) / 1000) + 1)
  }
  try {
    const job = await getWebhookJob(env, postId)
    if (job.status === 'registered' || job.status === 'held') {
      await notifyWebhookJob(env, job, token)
      return null
    }
    const stored = await env.DB.prepare('SELECT result_json AS resultJson FROM webhook_event_jobs WHERE post_id=?')
      .bind(postId)
      .first<{ resultJson: string | null }>()
    if (stored === null) throw new Error('Webhook job disappeared')
    const result =
      stored.resultJson === null
        ? await (async () => {
            const configuration = await detectionConfiguration(env)
            const request = createDetectionRequest(job.post, configuration.model)
            const raw: unknown = await detectionDeadline(env.AI.run(`@cf/cloudflare/${configuration.model}`, request))
            const response = ClefResponseSchema.safeParse(raw)
            if (!response.success) throw new Error('Invalid AI response')
            const decision = evaluateDetection(job.post, request, response.data, {
              eventThreshold: configuration.eventThreshold,
              fieldThreshold: configuration.choiceThreshold,
              ignoreThreshold: configuration.ignoreThreshold
            })
            await env.DB.prepare(
              `UPDATE webhook_event_jobs SET result_json=?,answers_json=?,model=?,question_version=?,confidence=?,judged_at=?,updated_at=? WHERE post_id=? AND lease_token=?`
            )
              .bind(
                JSON.stringify(decision),
                JSON.stringify(response.data.answers),
                configuration.model,
                DETECTION_VERSION,
                decision.confidence,
                dayjs().valueOf(),
                dayjs().valueOf(),
                postId,
                token
              )
              .run()
            return decision
          })()
        : (() => {
            const decision = DetectionResultSchema.safeParse(storedJson(stored.resultJson))
            if (!decision.success) throw new Error('Invalid stored AI result')
            return decision.data
          })()
    const candidate =
      result.status === 'ignored' || !result.candidate ? null : eventCandidate(result.candidate, job.eventUUID)
    const duplicates = candidate === null ? [] : await duplicateWebhookEvents(env, candidate, job.sourceUrl)
    const reasons = [
      ...result.reasons,
      ...(result.status === 'register' && candidate === null ? ['invalid_event_candidate'] : []),
      ...duplicates.map((id) => `possible_duplicate:${id}`)
    ]
    const canRegister = result.status === 'register' && candidate !== null && duplicates.length === 0
    await env.DB.prepare(
      `UPDATE webhook_event_jobs SET candidate_json=?,reasons_json=?,updated_at=? WHERE post_id=? AND lease_token=?`
    )
      .bind(
        candidate === null ? null : JSON.stringify(candidate),
        JSON.stringify(reasons),
        dayjs().valueOf(),
        postId,
        token
      )
      .run()
    if (canRegister && candidate !== null) {
      const semantic = JSON.stringify([candidate.stores.slice().sort(), candidate.category, candidate.startDate])
      const existing = await env.DB.prepare('SELECT post_id AS postId FROM webhook_event_jobs WHERE semantic_key=?')
        .bind(semantic)
        .first<{ postId: string }>()
      if (existing !== null && existing.postId !== postId) {
        await env.DB.prepare(
          `UPDATE webhook_event_jobs SET status='held',reasons_json=?,updated_at=? WHERE post_id=? AND lease_token=?`
        )
          .bind(
            JSON.stringify([...reasons, `possible_duplicate_post:${existing.postId}`]),
            dayjs().valueOf(),
            postId,
            token
          )
          .run()
      } else {
        await env.DB.prepare('UPDATE webhook_event_jobs SET semantic_key=? WHERE post_id=? AND lease_token=?')
          .bind(semantic, postId, token)
          .run()
        await registerWebhookEvent(
          env,
          await getWebhookJob(env, postId),
          validateWebhookEvent(candidate, job.eventUUID),
          token
        )
      }
    } else {
      const status = result.status === 'ignored' ? 'ignored' : 'held'
      await env.DB.prepare(
        `UPDATE webhook_event_jobs SET status=?,notification_status=?,updated_at=? WHERE post_id=? AND lease_token=?`
      )
        .bind(status, status === 'ignored' ? 'skipped' : 'pending', dayjs().valueOf(), postId, token)
        .run()
    }
    await notifyWebhookJob(env, await getWebhookJob(env, postId), token)
    return null
  } catch (error) {
    if (error instanceof NotificationRetry) return error.delay
    await env.DB.prepare(`UPDATE webhook_event_jobs SET status=CASE WHEN status='processing' THEN 'failed' ELSE status END,
      last_error='processing_failed',updated_at=? WHERE post_id=? AND lease_token=?`)
      .bind(dayjs().valueOf(), postId, token)
      .run()
    throw error
  } finally {
    await releaseWebhookJob(env, postId, token)
  }
}

export const handleWebhookQueue = async (batch: MessageBatch<unknown>, env: Bindings) => {
  for (const message of batch.messages) {
    const social = SocialQueueMessageSchema.safeParse(message.body)
    if (social.success) {
      try {
        if (batch.queue.endsWith('-dlq')) {
          await exhaustSocialJob(env, social.data.jobId)
          message.ack()
          continue
        }
        const delay = await processSocialJob(env, social.data.jobId)
        if (delay === null) message.ack()
        else message.retry({ delaySeconds: delay })
      } catch {
        console.error('[social-queue] processing failed')
        message.retry({ delaySeconds: 60 })
      }
      continue
    }

    const parsed = WebhookQueueMessageSchema.safeParse(message.body)
    if (!parsed.success) {
      message.ack()
      continue
    }
    try {
      if (batch.queue.endsWith('-dlq')) {
        await env.DB.prepare(`UPDATE webhook_event_jobs SET status=CASE WHEN status IN ('queued','processing','failed') THEN 'failed' ELSE status END,
          notification_status=CASE WHEN status IN ('held','registered') AND notification_status='pending' THEN 'failed' ELSE notification_status END,
          last_error='retry_exhausted',lease_token=NULL,lease_until=NULL,updated_at=? WHERE post_id=?`)
          .bind(dayjs().valueOf(), parsed.data.postId)
          .run()
        message.ack()
        continue
      }
      const delay = await processWebhookJob(env, parsed.data.postId)
      if (delay === null) message.ack()
      else message.retry({ delaySeconds: Math.min(delay, 43200) })
    } catch {
      console.error('[webhook-queue] processing failed')
      message.retry({ delaySeconds: Math.min(30 * 2 ** Math.min(message.attempts, 6), 1800) })
    }
  }
}
