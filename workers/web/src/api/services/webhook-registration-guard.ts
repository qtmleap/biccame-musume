import type { Bindings } from '@api/types/bindings'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { duplicateReasons, inspectWebhookDuplicates } from './webhook-duplicate-match'
import { webhookConditionIdentity, webhookItemIdentity } from './webhook-event-identity'
import { registerWebhookEvent, validateWebhookEvent } from './webhook-event-registration'
import type { WebhookTarget } from './webhook-job-record'

type RegistrationContext = { job: WebhookJob; target: WebhookTarget; token: string; item: string }

export const reserveWebhookRegistration = async (
  env: Pick<Bindings, 'DB'>,
  { job, target, token, item }: RegistrationContext,
  candidate: EventRequest
): Promise<string | null> => {
  const key = JSON.stringify([
    candidate.stores.slice().sort(),
    candidate.characterIds.slice().sort(),
    candidate.category,
    candidate.startDate,
    webhookItemIdentity(item),
    webhookConditionIdentity(candidate)
  ])
  // キーの重複確認と予約を同じ SQL 文で実行する。
  const [reservation, owner] = await env.DB.batch<{ postId: string }>([
    env.DB.prepare(`UPDATE ${target.table} SET semantic_key=? WHERE ${target.column}=? AND lease_token=?
      AND NOT EXISTS (SELECT 1 FROM ${target.table} WHERE semantic_key=? AND event_uuid<>?)`).bind(
      key,
      target.id,
      token,
      key,
      job.eventUUID
    ),
    env.DB.prepare(`SELECT post_id AS postId FROM ${target.table} WHERE semantic_key=? AND event_uuid<>?`).bind(
      key,
      job.eventUUID
    )
  ])
  if (reservation?.meta.changes === 1) return null
  const conflict = owner?.results[0]
  if (conflict !== undefined) return conflict.postId
  throw new Error('Webhook registration lease lost')
}

/** 照合済みの候補集合が書き込み前に変わったときだけ再試行する。 */
export const registerUnmatchedWebhookEvent = async (
  env: Bindings,
  { job, target, token, item }: RegistrationContext,
  candidate: EventRequest
): Promise<string[]> => {
  const event = validateWebhookEvent(candidate, job.eventUUID)
  const attempt = async (remaining: number): Promise<string[]> => {
    if (remaining === 0) throw new Error('Webhook duplicate candidates changed during registration')
    const snapshot = await inspectWebhookDuplicates(env, event, job.sourceUrl, item)
    if (snapshot.duplicates.length > 0) return duplicateReasons(snapshot.duplicates)
    return (await registerWebhookEvent(env, job, event, token, target, snapshot)) ? [] : attempt(remaining - 1)
  }
  return attempt(3)
}
