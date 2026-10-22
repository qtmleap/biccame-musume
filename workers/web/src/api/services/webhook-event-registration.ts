import { eventSocialSnapshot } from '@api/services/bot-announcement'
import { socialInsertStatements } from '@api/services/social-posting'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { calculateEventStatus } from '@biccame/shared/domain/event-status'
import { EventDetailSchema, type EventRequest, EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type WebhookTarget, webhookTarget } from './webhook-job-record'

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
        (condition.type === 'charge' && condition.chargeAmount === undefined) ||
        (condition.purchaseAmount !== undefined && !Number.isSafeInteger(condition.purchaseAmount)) ||
        (condition.chargeAmount !== undefined && !Number.isSafeInteger(condition.chargeAmount)) ||
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
      null,
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
    (id,event_id,type,purchase_amount,charge_amount,quantity,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(
        condition.uuid,
        event.uuid,
        condition.type,
        condition.purchaseAmount === undefined ? null : condition.purchaseAmount,
        condition.chargeAmount === undefined ? null : condition.chargeAmount,
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
  statements.push(
    ...[...new Set(event.characterIds)].map((characterId) =>
      env.DB.prepare(`INSERT INTO event_characters
    (id,event_id,character_id,created_at,updated_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(
        crypto.randomUUID(),
        event.uuid,
        characterId,
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
