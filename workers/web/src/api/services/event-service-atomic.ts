import { eventSocialSnapshot } from '@api/services/bot-announcement'
import { toEventDates } from '@api/services/event-service-payload'
import { recoverSocialJobs, socialInsertStatements } from '@api/services/social-posting'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { calculateEventStatus } from '@biccame/shared/domain/event-status'
import { type EventDetail, EventDetailSchema, type EventRequest } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

/** 投稿予約が必要な保存だけ、イベント・子レコード・outboxを同一batchで確定する。 */
export const usesAtomicEventSave = (env: Bindings, data: EventRequest): boolean =>
  data.shouldTweet && (env.X_POSTING_ENABLED === 'true' || env.DISCORD_POSTING_ENABLED === 'true')

/** atomic保存経路の読み取りもD1 batchで揃え、版と子レコードの不整合を防ぐ。 */
export const readAtomicManualEvent = async (env: Pick<Bindings, 'DB'>, id: string): Promise<EventDetail> => {
  const [parents, conditions, references, stores, characters, comments] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare(`SELECT id AS uuid,category,title,limited_quantity AS limitedQuantity,start_date AS startDate,
      end_date AS endDate,ended_at AS endedAt,is_verified AS isVerified,is_preliminary AS isPreliminary,
      group_id AS groupId,created_at AS createdAt,updated_at AS updatedAt FROM events WHERE id=?`).bind(id),
    env.DB.prepare(
      'SELECT id AS uuid,type,purchase_amount AS purchaseAmount,charge_amount AS chargeAmount,quantity FROM event_conditions WHERE event_id=? ORDER BY rowid'
    ).bind(id),
    env.DB.prepare('SELECT id AS uuid,type,url FROM event_reference_urls WHERE event_id=? ORDER BY rowid').bind(id),
    env.DB.prepare('SELECT store_key AS storeKey FROM event_stores WHERE event_id=? ORDER BY rowid').bind(id),
    env.DB.prepare(
      'SELECT character_id AS characterId FROM event_characters WHERE event_id=? ORDER BY character_id'
    ).bind(id),
    env.DB.prepare(
      'SELECT id,nickname,body,created_at AS createdAt,user_id AS userId FROM event_comments WHERE event_id=? AND deleted_at IS NULL ORDER BY created_at DESC,rowid'
    ).bind(id)
  ])
  const row = parents.results[0]
  if (row === undefined) throw new HTTPException(404, { message: 'Not Found' })
  const dates = z
    .object({ startDate: z.coerce.date(), endDate: z.coerce.date().nullable(), endedAt: z.coerce.date().nullable() })
    .safeParse(row)
  if (!dates.success) throw new Error('Invalid event dates')
  const parsed = EventDetailSchema.safeParse({
    ...row,
    endDate: row.endDate === null ? undefined : row.endDate,
    endedAt: row.endedAt === null ? undefined : row.endedAt,
    limitedQuantity: row.limitedQuantity === null ? undefined : row.limitedQuantity,
    groupId: row.groupId === null ? undefined : row.groupId,
    characterIds: characters.results.map((character) => character.characterId),
    isVerified: row.isVerified === 1,
    isPreliminary: row.isPreliminary === 1,
    conditions: conditions.results.map((condition) => ({
      ...condition,
      purchaseAmount: condition.purchaseAmount === null ? undefined : condition.purchaseAmount,
      chargeAmount: condition.chargeAmount === null ? undefined : condition.chargeAmount,
      quantity: condition.quantity === null ? undefined : condition.quantity
    })),
    referenceUrls: references.results,
    stores: stores.results.map((store) => store.storeKey),
    comments: comments.results.map((comment) => ({
      id: comment.id,
      characterId: comment.nickname,
      body: comment.body,
      createdAt: dayjs(String(comment.createdAt)).isValid()
        ? dayjs(String(comment.createdAt)).toISOString()
        : dayjs(Number(comment.createdAt)).toISOString(),
      verified: comment.userId !== null
    })),
    interestedCount: 0,
    completedCount: 0,
    ...calculateEventStatus(dates.data, dayjs().toISOString())
  })
  if (!parsed.success) throw new Error('Invalid event snapshot')
  return parsed.data
}

const VersionRowSchema = z.object({ updated_at: z.union([z.number(), z.string().nonempty()]) })

export const saveAtomicManualEvent = async (
  env: Bindings,
  data: EventRequest,
  purpose: 'created' | 'updated'
): Promise<{ event: EventDetail; created: boolean }> => {
  // 更新の同時実行はrevisionのCASで検出し、保存前の競合だけ有限回やり直す。
  for (const _attempt of [0, 1, 2, 3, 4]) {
    const version = await env.DB.prepare('SELECT updated_at FROM events WHERE id=?').bind(data.uuid).first()
    if (purpose === 'created' && version !== null)
      return { event: await readAtomicManualEvent(env, data.uuid), created: false }
    if (purpose === 'updated' && version === null) throw new HTTPException(404, { message: 'Not Found' })
    const previous = purpose === 'updated' ? await readAtomicManualEvent(env, data.uuid) : null
    const revision = version === null ? null : VersionRowSchema.safeParse(version)
    if (revision !== null && !revision.success) throw new Error('Invalid event revision')
    const now = Math.max(dayjs().valueOf(), previous === null ? 0 : previous.updatedAt.getTime() + 1)
    // social_post_jobs は BigInt のミリ秒、イベント系の DateTime 列は Prisma と同じ文字列で保存する。
    const timestamp = toD1DateTime(now)
    const token = crypto.randomUUID()
    const conditions = data.conditions.map((condition) => ({
      ...condition,
      uuid: purpose === 'created' ? crypto.randomUUID() : condition.uuid
    }))
    const referenceUrls = data.referenceUrls.map((reference) => ({
      ...reference,
      uuid: purpose === 'created' ? crypto.randomUUID() : reference.uuid
    }))
    const parsed = EventDetailSchema.safeParse({
      ...data,
      ...toEventDates(data),
      endDate: data.endDate === undefined ? undefined : dayjs(data.endDate).toDate(),
      endedAt: data.endedAt === undefined ? undefined : dayjs(data.endedAt).toDate(),
      limitedQuantity:
        data.limitedQuantity === undefined && previous !== null ? previous.limitedQuantity : data.limitedQuantity,
      createdAt: previous === null ? now : previous.createdAt,
      updatedAt: now,
      conditions,
      referenceUrls,
      comments: previous === null ? [] : previous.comments,
      ...calculateEventStatus(data, dayjs(now).toISOString()),
      interestedCount: previous === null ? 0 : previous.interestedCount,
      completedCount: previous === null ? 0 : previous.completedCount
    })
    if (!parsed.success) throw new HTTPException(400, { message: 'Invalid event snapshot' })
    const event = parsed.data
    const snapshot = eventSocialSnapshot(event, purpose)
    const initialGuard =
      purpose === 'created'
        ? 'NOT EXISTS (SELECT 1 FROM events WHERE id=?)'
        : 'EXISTS (SELECT 1 FROM events WHERE id=? AND updated_at=? AND limited_quantity IS ?)'
    const initialValues =
      revision !== null && revision.success && previous !== null
        ? [
            data.uuid,
            revision.data.updated_at,
            previous.limitedQuantity === undefined ? null : previous.limitedQuantity
          ]
        : [data.uuid]
    // mutation markerはbatch中だけ存在する。固有tokenで作成競合を区別し、最後に削除する。
    const statements = [
      env.DB.prepare(`INSERT INTO social_post_jobs
      (id,channel,key,snapshot_json,status,available_at,created_at,updated_at)
      SELECT ?,'mutation',?,?,'skipped',?,?,? WHERE ${initialGuard}`).bind(
        token,
        `mutation:${token}`,
        JSON.stringify(snapshot),
        now,
        now,
        now,
        ...initialValues
      )
    ]
    const guard = "EXISTS (SELECT 1 FROM social_post_jobs WHERE id=? AND channel='mutation')"
    const fields = [
      data.category,
      data.title,
      event.limitedQuantity === undefined ? null : event.limitedQuantity,
      toD1DateTime(data.startDate),
      data.endDate === undefined ? null : toD1DateTime(data.endDate),
      data.endedAt === undefined ? null : toD1DateTime(data.endedAt),
      data.isVerified ? 1 : 0,
      data.isPreliminary ? 1 : 0,
      data.groupId === undefined ? null : data.groupId,
      null
    ]
    if (purpose === 'created') {
      statements.push(
        env.DB.prepare(`INSERT INTO events
        (id,category,title,limited_quantity,start_date,end_date,ended_at,is_verified,is_preliminary,group_id,character_id,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(data.uuid, ...fields, timestamp, timestamp, token)
      )
    } else {
      statements.push(
        env.DB.prepare(`UPDATE events SET category=?,title=?,limited_quantity=?,start_date=?,end_date=?,ended_at=?,
        is_verified=?,is_preliminary=?,group_id=?,character_id=?,updated_at=? WHERE id=? AND ${guard}`).bind(
          ...fields,
          timestamp,
          data.uuid,
          token
        )
      )
      for (const table of ['event_conditions', 'event_reference_urls', 'event_stores', 'event_characters']) {
        statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE event_id=? AND ${guard}`).bind(data.uuid, token))
      }
    }
    statements.push(
      ...conditions.map((condition) =>
        env.DB.prepare(`INSERT INTO event_conditions
      (id,event_id,type,purchase_amount,charge_amount,quantity,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(
          condition.uuid,
          data.uuid,
          condition.type,
          condition.purchaseAmount === undefined ? null : condition.purchaseAmount,
          condition.chargeAmount === undefined ? null : condition.chargeAmount,
          condition.quantity === undefined ? null : condition.quantity,
          timestamp,
          timestamp,
          token
        )
      )
    )
    statements.push(
      ...referenceUrls.map((reference) =>
        env.DB.prepare(`INSERT INTO event_reference_urls
      (id,event_id,type,url,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(
          reference.uuid,
          data.uuid,
          reference.type,
          reference.url,
          timestamp,
          timestamp,
          token
        )
      )
    )
    statements.push(
      ...data.stores.map((store) =>
        env.DB.prepare(`INSERT INTO event_stores
      (id,event_id,store_key,created_at,updated_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(
          crypto.randomUUID(),
          data.uuid,
          store,
          timestamp,
          timestamp,
          token
        )
      )
    )
    statements.push(
      ...[...new Set(data.characterIds)].map((characterId) =>
        env.DB.prepare(`INSERT INTO event_characters
      (id,event_id,character_id,created_at,updated_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(
          crypto.randomUUID(),
          data.uuid,
          characterId,
          timestamp,
          timestamp,
          token
        )
      )
    )
    if (event.isVerified) {
      statements.push(...socialInsertStatements(env, snapshot, `WHERE ${guard}`, [token]))
    }
    statements.push(env.DB.prepare("DELETE FROM social_post_jobs WHERE id=? AND channel='mutation'").bind(token))
    const results = await env.DB.batch(statements)
    if (results[0].meta.changes !== 1) continue
    // Queue投入はcommit後。投入失敗でもpending outboxをcronが回収する。
    await recoverSocialJobs(env).catch(() => console.error('[social] post-save queue recovery failed'))
    return { event, created: purpose === 'created' }
  }
  throw new HTTPException(409, { message: 'Event changed concurrently; retry required' })
}
