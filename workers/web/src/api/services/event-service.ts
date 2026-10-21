import { Prisma } from '@api/db/generated/prisma/client'
import { getPrisma } from '@api/db/prisma'
import { eventSocialSnapshot } from '@api/services/bot-announcement'
import { recoverSocialJobs, socialInsertStatements } from '@api/services/social-posting'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { calculateEventStatus } from '@biccame/shared/domain/event-status'
import type { CommentResponse } from '@biccame/shared/schemas/comment.dto'
import {
  type Event,
  type EventCategory,
  type EventCharacter,
  type EventConditionType,
  type EventDetail,
  EventDetailSchema,
  type EventRequest,
  EventSchema,
  type ReferenceUrlType
} from '@biccame/shared/schemas/event.dto'
import type { StoreKey } from '@biccame/shared/schemas/store.dto'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Tokyo')

/**
 * PrismaのイベントモデルをAPIレスポンス用のEvent型に変換
 * @param event - Prismaから取得した生のイベントデータ
 * @param interestedCount - 興味ありカウント（オプション）
 * @param completedCount - 達成カウント（オプション）
 * @returns APIレスポンス用のEvent型オブジェクト
 */
/**
 * イベント一覧用の select 句。
 * transform() で実際に参照する列のみ取得して D1 のシリアライズコストを抑える。
 */
export const EVENT_LIST_SELECT = {
  id: true,
  category: true,
  title: true,
  limitedQuantity: true,
  startDate: true,
  endDate: true,
  endedAt: true,
  isVerified: true,
  isPreliminary: true,
  groupId: true,
  characterId: true,
  createdAt: true,
  updatedAt: true,
  conditions: {
    select: { id: true, type: true, purchaseAmount: true, quantity: true }
  },
  stores: {
    select: { storeKey: true }
  }
} as const satisfies Prisma.EventSelect

/**
 * イベント詳細用の select 句。 EVENT_LIST_SELECT に referenceUrls / comments を加える。
 */
const EVENT_DETAIL_SELECT = {
  ...EVENT_LIST_SELECT,
  referenceUrls: {
    select: { id: true, type: true, url: true }
  },
  comments: {
    select: { id: true, nickname: true, body: true, createdAt: true, userId: true, deletedAt: true }
  }
} as const satisfies Prisma.EventSelect

export type EventListPayload = Prisma.EventGetPayload<{ select: typeof EVENT_LIST_SELECT }>

type EventDetailPayload = Prisma.EventGetPayload<{ select: typeof EVENT_DETAIL_SELECT }>

export const transform = (event: EventListPayload, interestedCount = 0, completedCount = 0): Event => {
  const { status, daysUntil } = calculateEventStatus(event, dayjs().toISOString())
  return {
    uuid: event.id,
    category: event.category as EventCategory,
    title: event.title,
    limitedQuantity: event.limitedQuantity ?? undefined,
    startDate: event.startDate,
    endDate: event.endDate ?? undefined,
    endedAt: event.endedAt ?? undefined,
    isVerified: event.isVerified,
    isPreliminary: event.isPreliminary,
    groupId: event.groupId ?? undefined,
    characterId: (event.characterId ?? undefined) as EventCharacter | undefined,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    conditions: event.conditions.map((c) => ({
      uuid: c.id,
      type: c.type as EventConditionType,
      purchaseAmount: c.purchaseAmount ?? undefined,
      quantity: c.quantity ?? undefined
    })),
    stores: event.stores.map((s) => s.storeKey as StoreKey),
    status,
    daysUntil,
    interestedCount,
    completedCount
  }
}

// userId はレスポンスに含めない (他ユーザーの Firebase uid を公開しないため、ログイン投稿かの boolean のみ返す)
const toCommentResponse = (comment: {
  id: string
  nickname: string
  body: string
  createdAt: Date
  userId: string | null
}): CommentResponse => ({
  id: comment.id,
  characterId: comment.nickname,
  body: comment.body,
  createdAt: comment.createdAt.toISOString(),
  verified: comment.userId !== null
})

const transformDetail = (event: EventDetailPayload, interestedCount = 0, completedCount = 0): EventDetail => ({
  ...transform(event, interestedCount, completedCount),
  referenceUrls: event.referenceUrls.map((r) => ({
    uuid: r.id,
    type: r.type as ReferenceUrlType,
    url: r.url
  })),
  comments: event.comments
    .filter((c) => c.deletedAt === null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(toCommentResponse)
})

/**
 * 指定されたIDのイベントを取得
 * @param env - Cloudflare Workers環境変数
 * @param id - イベントのUUID
 * @returns イベント情報（statsを含む）
 * @throws HTTPException 404 - イベントが見つからない場合
 */
export const getEvent = async (env: Bindings, id: string): Promise<EventDetail> => {
  const prisma = getPrisma(env)
  const [event, interestedCount, completedCount] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      select: EVENT_DETAIL_SELECT
    }),
    prisma.userEvent.count({ where: { eventId: id, status: 'interested' } }),
    prisma.userEvent.count({ where: { eventId: id, status: 'completed' } })
  ])
  if (event === null) {
    throw new HTTPException(404, { message: 'Not Found' })
  }
  return transformDetail(event, interestedCount, completedCount)
}

/** D1 のバインド数上限 (100) に収まるよう、関連つきでイベントを読む ID の単位を絞る。 */
const EVENT_ID_CHUNK_SIZE = 50

/**
 * 指定された ID のイベントを、渡された ID の順に取得する。
 * Prisma は conditions / stores を IN (<取得対象の ID 全件>) で読むため、
 * ID を少数ずつに分けて逐次取得し、D1 のバインド数上限を超えないようにする。
 * 取得の間に削除された ID は結果から除く。
 * @param env - Cloudflare Workers環境変数
 * @param ids - 取得するイベントID (この順に返す)
 * @throws HTTPException 400 - バリデーションエラーの場合
 */
const getEventsByIds = async (env: Bindings, ids: string[]): Promise<Event[]> => {
  const prisma = getPrisma(env)
  const uniqueIds = [...new Set(ids)]
  const rows: EventListPayload[] = []
  for (const offset of Array.from(
    { length: Math.ceil(uniqueIds.length / EVENT_ID_CHUNK_SIZE) },
    (_, index) => index * EVENT_ID_CHUNK_SIZE
  )) {
    rows.push(
      ...(await prisma.event.findMany({
        where: { id: { in: uniqueIds.slice(offset, offset + EVENT_ID_CHUNK_SIZE) } },
        select: EVENT_LIST_SELECT
      }))
    )
  }
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const events = uniqueIds.flatMap((id) => {
    const row = rowById.get(id)
    return row === undefined ? [] : [transform(row)]
  })
  const result = EventSchema.array().safeParse(events)
  if (!result.success) {
    throw new HTTPException(400, { message: result.error.message })
  }
  return result.data
}

/**
 * イベント一覧を where 条件つきで取得 (開始日降順)
 * 絞り込みと並び順は ID だけの軽いクエリで決め、関連つきの本体は ID を分けて取得する。
 * @param env - Cloudflare Workers環境変数
 * @param where - 絞り込み条件 (省略時は全件)
 * @throws HTTPException 400 - バリデーションエラーの場合
 */
const listEvents = async (env: Bindings, where?: Prisma.EventWhereInput): Promise<Event[]> => {
  const prisma = getPrisma(env)
  const rows = await prisma.event.findMany({ where, select: { id: true }, orderBy: { startDate: 'desc' } })
  return getEventsByIds(
    env,
    rows.map((row) => row.id)
  )
}

/**
 * 公開済みイベント一覧を取得
 * @param env - Cloudflare Workers環境変数
 * @returns イベント一覧（開始日降順）
 * @throws HTTPException 400 - バリデーションエラーの場合
 */
export const getEvents = async (env: Bindings): Promise<Event[]> => listEvents(env, { isVerified: true })

/**
 * 管理画面向けのイベント一覧を取得 (未確認のイベントを含む)
 * 公開側には使わないこと (公開は getEvents)
 * @param env - Cloudflare Workers環境変数
 * @returns 確認済み・未確認の両方のイベント一覧（開始日降順）
 * @throws HTTPException 400 - バリデーションエラーの場合
 */
export const getAdminEvents = async (env: Bindings): Promise<Event[]> => listEvents(env)

/** Webhook由来で新規作成したイベントを識別する（保留承認を含み、既存イベントへの紐付けは除外）。 */
export const getWebhookEventIds = async (env: Pick<Bindings, 'DB'>): Promise<string[]> => {
  const rows = await env.DB.prepare(`SELECT DISTINCT e.id FROM events e
    INNER JOIN webhook_event_jobs j ON j.event_id=e.id AND j.event_uuid=e.id AND j.post_id=e.clef_post_id
    WHERE j.status='registered'`).all<{ id: string }>()
  return rows.results.map((row) => row.id)
}

/** 登録元を確認したイベントだけを通常の管理一覧と同じ形式で返す。 */
export const getAdminWebhookEvents = async (env: Bindings): Promise<Event[]> => {
  const events = await getEventsByIds(env, await getWebhookEventIds(env))
  return events.sort((left, right) => dayjs(right.startDate).valueOf() - dayjs(left.startDate).valueOf())
}

/**
 * EventRequest の日付フィールドを Prisma 用の Date / null に変換
 */
const toEventDates = (data: EventRequest) => ({
  startDate: dayjs(data.startDate).toDate(),
  endDate: data.endDate ? dayjs(data.endDate).toDate() : null,
  endedAt: data.endedAt ? dayjs(data.endedAt).toDate() : null
})

/**
 * 関連レコードの nested create ペイロードを組み立てる
 * `useClientId=true` のとき client から渡された UUID を id として採用 (update 時の挙動)、
 * `false` のとき Prisma の @default(uuid()) に任せる (create 時の挙動)
 */
const toConditionsCreate = (data: EventRequest, useClientId: boolean) =>
  data.conditions.map((c) => ({
    ...(useClientId ? { id: c.uuid } : {}),
    type: c.type,
    purchaseAmount: c.purchaseAmount,
    quantity: c.quantity
  }))

const toReferenceUrlsCreate = (data: EventRequest, useClientId: boolean) =>
  (data.referenceUrls ?? []).map((r) => ({
    ...(useClientId ? { id: r.uuid } : {}),
    type: r.type,
    url: r.url
  }))

const toStoresCreate = (data: EventRequest) => data.stores.map((storeKey) => ({ storeKey }))

/** 投稿予約が必要な保存だけ、イベント・子レコード・outboxを同一batchで確定する。 */
export const usesAtomicEventSave = (env: Bindings, data: EventRequest): boolean =>
  data.shouldTweet && (env.X_POSTING_ENABLED === 'true' || env.DISCORD_POSTING_ENABLED === 'true')

/** atomic保存経路の読み取りもD1 batchで揃え、版と子レコードの不整合を防ぐ。 */
export const readAtomicManualEvent = async (env: Pick<Bindings, 'DB'>, id: string): Promise<EventDetail> => {
  const [parents, conditions, references, stores, comments] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare(`SELECT id AS uuid,category,title,limited_quantity AS limitedQuantity,start_date AS startDate,
      end_date AS endDate,ended_at AS endedAt,is_verified AS isVerified,is_preliminary AS isPreliminary,
      group_id AS groupId,character_id AS characterId,created_at AS createdAt,updated_at AS updatedAt FROM events WHERE id=?`).bind(
      id
    ),
    env.DB.prepare(
      'SELECT id AS uuid,type,purchase_amount AS purchaseAmount,quantity FROM event_conditions WHERE event_id=? ORDER BY rowid'
    ).bind(id),
    env.DB.prepare('SELECT id AS uuid,type,url FROM event_reference_urls WHERE event_id=? ORDER BY rowid').bind(id),
    env.DB.prepare('SELECT store_key AS storeKey FROM event_stores WHERE event_id=? ORDER BY rowid').bind(id),
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
    characterId: row.characterId === null ? undefined : row.characterId,
    isVerified: row.isVerified === 1,
    isPreliminary: row.isPreliminary === 1,
    conditions: conditions.results.map((condition) => ({
      ...condition,
      purchaseAmount: condition.purchaseAmount === null ? undefined : condition.purchaseAmount,
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

const saveAtomicManualEvent = async (
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
      data.characterId === undefined ? null : data.characterId
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
      for (const table of ['event_conditions', 'event_reference_urls', 'event_stores']) {
        statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE event_id=? AND ${guard}`).bind(data.uuid, token))
      }
    }
    statements.push(
      ...conditions.map((condition) =>
        env.DB.prepare(`INSERT INTO event_conditions
      (id,event_id,type,purchase_amount,quantity,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`).bind(
          condition.uuid,
          data.uuid,
          condition.type,
          condition.purchaseAmount === undefined ? null : condition.purchaseAmount,
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

/**
 * 新規イベントを作成
 * 同一UUIDが存在する場合は既存イベントを返す（冪等性保証）
 * @param env - Cloudflare Workers環境変数
 * @param data - イベント作成リクエストデータ
 * @returns イベント情報と、この呼び出しで新規作成したかどうか
 */
export const createEvent = async (
  env: Bindings,
  data: EventRequest
): Promise<{ event: EventDetail; created: boolean }> => {
  if (usesAtomicEventSave(env, data)) return saveAtomicManualEvent(env, data, 'created')
  const prisma = getPrisma(env)

  const existingEvent = await prisma.event.findUnique({
    where: { id: data.uuid },
    select: EVENT_DETAIL_SELECT
  })

  if (existingEvent) {
    return { event: transformDetail(existingEvent), created: false }
  }

  try {
    const event = await prisma.event.create({
      data: {
        id: data.uuid,
        category: data.category,
        title: data.title,
        limitedQuantity: data.limitedQuantity,
        ...toEventDates(data),
        isVerified: data.isVerified ?? false,
        isPreliminary: data.isPreliminary ?? false,
        groupId: data.groupId ?? null,
        characterId: data.characterId ?? null,
        conditions: { create: toConditionsCreate(data, false) },
        referenceUrls: { create: toReferenceUrlsCreate(data, false) },
        stores: { create: toStoresCreate(data) }
      },
      select: EVENT_DETAIL_SELECT
    })
    return { event: transformDetail(event), created: true }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Another request may have inserted this UUID after the initial lookup.
      const existingEvent = await prisma.event.findUnique({
        where: { id: data.uuid },
        select: EVENT_DETAIL_SELECT
      })
      if (existingEvent) return { event: transformDetail(existingEvent), created: false }
    }
    throw error
  }
}

/**
 * 既存イベントを更新
 * 関連データ（conditions, referenceUrls, stores）は全て置換される
 * @param env - Cloudflare Workers環境変数
 * @param data - イベント更新リクエストデータ（uuidが必須）
 * @returns 更新されたイベント情報
 */
export const updateEvent = async (env: Bindings, data: EventRequest): Promise<EventDetail> => {
  if (usesAtomicEventSave(env, data)) return (await saveAtomicManualEvent(env, data, 'updated')).event
  const prisma = getPrisma(env)

  const event = await prisma.event.update({
    where: { id: data.uuid },
    data: {
      category: data.category,
      title: data.title,
      limitedQuantity: data.limitedQuantity,
      ...toEventDates(data),
      isVerified: data.isVerified,
      isPreliminary: data.isPreliminary,
      groupId: data.groupId ?? null,
      characterId: data.characterId ?? null,
      conditions: { deleteMany: {}, create: toConditionsCreate(data, true) },
      referenceUrls: { deleteMany: {}, create: toReferenceUrlsCreate(data, true) },
      stores: { deleteMany: {}, create: toStoresCreate(data) }
    },
    select: EVENT_DETAIL_SELECT
  })

  return transformDetail(event)
}

/**
 * イベントをタイトルで全文検索
 * @param env - Cloudflare Workers環境変数
 * @param q - 検索クエリ文字列
 * @returns 検索結果のイベント一覧（開始日降順、最大50件）
 */
export const searchEvents = async (env: Bindings, q: string): Promise<Event[]> => {
  const prisma = getPrisma(env)
  const events = (
    await prisma.event.findMany({
      where: {
        title: { contains: q },
        isVerified: true
      },
      select: EVENT_LIST_SELECT,
      orderBy: { startDate: 'desc' },
      take: 50
    })
  ).map((v) => transform(v))
  const result = EventSchema.array().safeParse(events)
  if (!result.success) {
    throw new HTTPException(400, { message: result.error.message })
  }
  return result.data
}

/**
 * イベントを削除
 * 関連データ（conditions, referenceUrls, stores）もカスケード削除される
 * @param env - Cloudflare Workers環境変数
 * @param id - 削除するイベントのUUID
 * @returns null
 */
export const deleteEvent = async (env: Bindings, id: string): Promise<null> => {
  const prisma = getPrisma(env)
  await prisma.event.delete({ where: { id: id } })
  return null
}

/**
 * 「JST で本日開始」のイベントを取得（毎朝の cron 告知ツイート用）
 */
export const getEventsStartingToday = async (env: Bindings, now: Date = dayjs().toDate()): Promise<Event[]> => {
  const prisma = getPrisma(env)
  const startOfDayJst = dayjs(now).tz('Asia/Tokyo').startOf('day')
  const startOfNextDayJst = startOfDayJst.add(1, 'day')
  const events = (
    await prisma.event.findMany({
      where: {
        isVerified: true,
        startDate: { gte: startOfDayJst.toDate(), lt: startOfNextDayJst.toDate() },
        endedAt: null,
        OR: [{ endDate: null }, { endDate: { gte: startOfDayJst.toDate() } }]
      },
      select: EVENT_LIST_SELECT,
      orderBy: { startDate: 'asc' }
    })
  ).map((v) => transform(v))
  const result = EventSchema.array().safeParse(events)
  if (!result.success) throw new HTTPException(400, { message: result.error.message })
  return result.data
}

/**
 * 終了日（endedAt 優先、無ければ endDate）が [from, until) に入る公開イベントを取得。
 * 終了日不明のイベントは含めない。
 */
const getEventsEndingBetween = async (env: Bindings, from: Date, until: Date): Promise<Event[]> => {
  const prisma = getPrisma(env)
  const events = (
    await prisma.event.findMany({
      where: {
        isVerified: true,
        OR: [{ endedAt: { gte: from, lt: until } }, { endedAt: null, endDate: { gte: from, lt: until } }]
      },
      select: EVENT_LIST_SELECT,
      orderBy: { startDate: 'asc' }
    })
  ).map((v) => transform(v))
  const result = EventSchema.array().safeParse(events)
  if (!result.success) throw new HTTPException(400, { message: result.error.message })
  return result.data
}

/**
 * 「JST で本日終了」のイベントを取得（毎朝の投稿用）
 */
export const getEventsEndingToday = async (env: Bindings, now: Date = dayjs().toDate()): Promise<Event[]> => {
  const startOfDayJst = dayjs(now).tz('Asia/Tokyo').startOf('day')
  return getEventsEndingBetween(env, startOfDayJst.toDate(), startOfDayJst.add(1, 'day').toDate())
}

/** 「週内に開始」の公開イベント。from（含む）〜 until（含まない）は JST の月曜 0 時から翌月曜 0 時。 */
export const getEventsStartingInWeek = async (env: Bindings, from: string, until: string): Promise<Event[]> =>
  listEvents(env, { isVerified: true, startDate: { gte: dayjs(from).toDate(), lt: dayjs(until).toDate() } })

/** 「週内に終了」の公開イベント（endedAt 優先）。終了日不明は含めない。 */
export const getEventsEndingInWeek = async (env: Bindings, from: string, until: string): Promise<Event[]> =>
  getEventsEndingBetween(env, dayjs(from).toDate(), dayjs(until).toDate())
