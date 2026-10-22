import { notifyEventDetection } from '@api/services/discord'
import { getEvent } from '@api/services/event-service'
import { getWebhookJob, type WebhookTarget, webhookTarget } from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import { discordDeliveryResultSchema, type EventDetectionNotification } from '@biccame/shared/bot'
import { extractionCharacters, extractionStores } from '@biccame/shared/event-detect/extraction'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'

const siteOrigin = (env: Bindings) =>
  env.ENVIRONMENT === 'prod'
    ? 'https://biccame-musume.com'
    : env.ENVIRONMENT === 'dev'
      ? 'https://dev.biccame-musume.com'
      : 'http://localhost:15175'

export class NotificationRetry extends Error {
  readonly delay: number
  constructor(delay: number) {
    super('Notification retry required')
    this.delay = delay
  }
}

export const notifyWebhookJob = async (
  env: Bindings,
  job: WebhookJob,
  token: string,
  target: WebhookTarget = webhookTarget(job.postId)
): Promise<void> => {
  if ((job.status !== 'held' && job.status !== 'registered') || job.notificationStatus !== 'pending') return
  const candidate = job.candidate
  // 下書き値は発見判定が当該項目を確定済みと記録している場合だけ通知へ渡す。
  const confirmedDraft = job.discovery?.relevance === 'detected' ? job.draft : null
  const stores =
    candidate !== null
      ? candidate.stores
      : confirmedDraft !== null && !job.discovery?.missingFields.includes('stores')
        ? confirmedDraft.stores
        : []
  const characters =
    candidate !== null
      ? candidate.characterIds
      : confirmedDraft !== null && !job.discovery?.missingFields.includes('characterIds')
        ? confirmedDraft.characterIds
        : []
  const eventId = job.eventId
  const registered = job.status === 'registered' && eventId !== null ? await getEvent(env, eventId) : null
  const siblings = target.table === 'webhook_event_candidates' ? (await getWebhookJob(env, job.postId)).candidates : []
  const position = siblings.findIndex((value) => value.eventUUID === job.eventUUID)
  const sibling = siblings[position]
  const common = {
    ...(sibling === undefined
      ? {}
      : { candidate: { id: job.eventUUID, item: sibling.item, index: position + 1, total: siblings.length } }),
    requestId: job.eventUUID,
    postId: job.postId,
    postUrl: job.sourceUrl,
    managementUrl: `${siteOrigin(env)}/admin/webhooks/${job.postId}`,
    text: job.post.text,
    ...(job.discovery === undefined ? {} : { discovery: job.discovery }),
    confidence: job.confidence === null ? 0 : job.confidence,
    reasons: job.reasons.slice(0, 20).map((reason) => reason.slice(0, 500)),
    stores: (registered ? registered.stores : stores).map((id) => {
      const store = extractionStores(job.post).find((value) => value.id === id)
      return store ? store.name : id
    }),
    characters: (registered ? registered.characterIds : characters).map((id) => {
      const character = extractionCharacters().find((value) => value.id === id)
      return character ? character.name : id === 'other' ? 'その他' : id === 'secret' ? 'シークレット' : id
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
            conditions: registered.conditions.map((condition) =>
              condition.type === 'charge'
                ? condition.chargeAmount === undefined
                  ? '入金・チャージ'
                  : `${condition.chargeAmount.toLocaleString('ja-JP')}円以上入金`
                : `${condition.type}${condition.purchaseAmount === undefined ? '' : ` ${condition.purchaseAmount}円`}${condition.quantity === undefined ? '' : ` ${condition.quantity}名`}`
            )
          }
        }
      : { ...common, status: 'held' }
  // 送信開始を先に記録する。結果保存前に停止した場合の盲目的再送を防ぐ。
  const started = await env.DB.prepare(`UPDATE ${target.table} SET notification_status='unknown',
    notification_error='delivery_in_progress',notification_attempts=notification_attempts+1,updated_at=?
    WHERE ${target.column}=? AND lease_token=? AND notification_status='pending'`)
    .bind(dayjs().valueOf(), target.id, token)
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
      `UPDATE ${target.table} SET notification_status=?,notification_id=?,notification_error=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`
    )
      .bind(status, result.status === 'sent' ? result.messageId : null, error, dayjs().valueOf(), target.id, token)
      .run()
    if (retryDelay !== null) throw new NotificationRetry(retryDelay)
  } catch (error) {
    if (error instanceof NotificationRetry) throw error
    await env.DB.prepare(
      `UPDATE ${target.table} SET notification_status='unknown',notification_error='delivery_unknown',updated_at=? WHERE ${target.column}=? AND lease_token=?`
    )
      .bind(dayjs().valueOf(), target.id, token)
      .run()
  }
}
