import type { Prisma } from '@api/db/generated/prisma/client'
import { getPrisma } from '@api/db/prisma'
import {
  EVENT_DETAIL_SELECT,
  EVENT_LIST_SELECT,
  type EventListPayload,
  transform,
  transformDetail
} from '@api/services/event-service-model'
import type { Bindings } from '@api/types/bindings'
import { type Event, type EventDetail, EventSchema } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'

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
 * Prisma は characters / conditions / stores を IN (<取得対象の ID 全件>) で読むため、
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
