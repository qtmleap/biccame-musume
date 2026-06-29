import type { Prisma } from '@prisma/client'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { HTTPException } from 'hono/http-exception'
import { getPrisma } from '@/lib/prisma'
import type { CommentResponse } from '@/schemas/comment.dto'
import {
  type Event,
  type EventCategory,
  type EventConditionType,
  type EventDetail,
  type EventRequest,
  EventSchema,
  type EventStatus,
  EventStatusSchema,
  type ReferenceUrlType
} from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'
import type { Bindings } from '@/types/bindings'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Tokyo')

/**
 * イベントのステータスと残り日数を計算
 * @param event - イベントの日付情報
 * @returns ステータス（upcoming/ongoing/last_day/ended）と残り日数
 */
const calculateEventStatus = (event: {
  startDate: Date
  endDate: Date | null
  endedAt: Date | null
}): { status: EventStatus; daysUntil: number } => {
  const now = dayjs().tz('Asia/Tokyo').startOf('day')
  const startDate = dayjs(event.startDate).tz('Asia/Tokyo').startOf('day')
  const endDate = event.endDate ? dayjs(event.endDate).tz('Asia/Tokyo').startOf('day') : null
  const endedAt = event.endedAt ? dayjs(event.endedAt).tz('Asia/Tokyo') : null

  // 実際の終了日時が設定されている場合は終了
  if (endedAt) {
    return { status: EventStatusSchema.enum.ended, daysUntil: 0 }
  }

  // 開始前
  if (now.isBefore(startDate)) {
    return { status: EventStatusSchema.enum.upcoming, daysUntil: startDate.diff(now, 'day') }
  }

  // 終了日が設定されていて、終了日を過ぎている場合
  if (endDate && now.isAfter(endDate, 'day')) {
    return { status: EventStatusSchema.enum.ended, daysUntil: 0 }
  }

  // 終了日当日は最終日
  if (endDate && now.isSame(endDate, 'day')) {
    return { status: EventStatusSchema.enum.last_day, daysUntil: 0 }
  }

  // 開催中
  if (endDate) {
    return { status: EventStatusSchema.enum.ongoing, daysUntil: endDate.diff(now, 'day') }
  }

  // 終了日未定で開催中
  return { status: EventStatusSchema.enum.ongoing, daysUntil: 0 }
}

/**
 * PrismaのイベントモデルをAPIレスポンス用のEvent型に変換
 * @param event - Prismaから取得した生のイベントデータ
 * @param interestedCount - 興味ありカウント（オプション）
 * @param completedCount - 達成カウント（オプション）
 * @returns APIレスポンス用のEvent型オブジェクト
 */
type EventListPayload = Prisma.EventGetPayload<{
  include: { conditions: true; stores: true }
}>

type EventDetailPayload = Prisma.EventGetPayload<{
  include: { conditions: true; referenceUrls: true; stores: true; comments: true }
}>

const transform = (event: EventListPayload, interestedCount = 0, completedCount = 0): Event => {
  const { status, daysUntil } = calculateEventStatus(event)
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
  userId: comment.userId ?? undefined
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
      include: EVENT_DETAIL_INCLUDE
    }),
    prisma.userEvent.count({ where: { eventId: id, status: 'interested' } }),
    prisma.userEvent.count({ where: { eventId: id, status: 'completed' } })
  ])
  if (event === null) {
    throw new HTTPException(404, { message: 'Not Found' })
  }
  return transformDetail(event, interestedCount, completedCount)
}

/**
 * 公開済みイベント一覧を取得（半年以内に開催されたもの）
 * @param env - Cloudflare Workers環境変数
 * @returns イベント一覧（開始日降順）
 * @throws HTTPException 400 - バリデーションエラーの場合
 */
export const getEvents = async (env: Bindings): Promise<Event[]> => {
  const prisma = getPrisma(env)
  // 半年前の日付を計算
  const startDate = dayjs().subtract(6, 'month').toDate()

  const events = (
    await prisma.event.findMany({
      where: {
        isVerified: true,
        // 半年以内に開催されたイベントのみ取得
        startDate: { gte: startDate }
      },
      include: {
        conditions: true,
        stores: true
      },
      orderBy: { startDate: 'desc' }
    })
  ).map((v) => transform(v))
  const result = EventSchema.array().safeParse(events)
  if (!result.success) {
    throw new HTTPException(400, { message: result.error.message })
  }
  return result.data
}

/**
 * EventDetail を返却するクエリで使う共通 include 句
 */
const EVENT_DETAIL_INCLUDE = {
  conditions: true,
  referenceUrls: true,
  stores: true,
  comments: true
} as const

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

/**
 * 新規イベントを作成
 * 同一UUIDが存在する場合は既存イベントを返す（冪等性保証）
 * @param env - Cloudflare Workers環境変数
 * @param data - イベント作成リクエストデータ
 * @returns 作成されたイベント情報
 */
export const createEvent = async (env: Bindings, data: EventRequest): Promise<EventDetail> => {
  const prisma = getPrisma(env)

  const existingEvent = await prisma.event.findUnique({
    where: { id: data.uuid },
    include: EVENT_DETAIL_INCLUDE
  })

  if (existingEvent) {
    console.log('Event already exists with id:', data.uuid)
    return transformDetail(existingEvent)
  }

  const event = await prisma.event.create({
    data: {
      id: data.uuid,
      category: data.category,
      title: data.title,
      limitedQuantity: data.limitedQuantity,
      ...toEventDates(data),
      isVerified: data.isVerified ?? false,
      isPreliminary: data.isPreliminary ?? false,
      conditions: { create: toConditionsCreate(data, false) },
      referenceUrls: { create: toReferenceUrlsCreate(data, false) },
      stores: { create: toStoresCreate(data) }
    },
    include: EVENT_DETAIL_INCLUDE
  })
  return transformDetail(event)
}

/**
 * 既存イベントを更新
 * 関連データ（conditions, referenceUrls, stores）は全て置換される
 * @param env - Cloudflare Workers環境変数
 * @param data - イベント更新リクエストデータ（uuidが必須）
 * @returns 更新されたイベント情報
 */
export const updateEvent = async (env: Bindings, data: EventRequest): Promise<EventDetail> => {
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
      conditions: { deleteMany: {}, create: toConditionsCreate(data, true) },
      referenceUrls: { deleteMany: {}, create: toReferenceUrlsCreate(data, true) },
      stores: { deleteMany: {}, create: toStoresCreate(data) }
    },
    include: EVENT_DETAIL_INCLUDE
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
      include: {
        conditions: true,
        stores: true
      },
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
export const getEventsStartingToday = async (env: Bindings, now: Date = new Date()): Promise<Event[]> => {
  const prisma = getPrisma(env)
  const startOfDayJst = dayjs(now).tz('Asia/Tokyo').startOf('day')
  const startOfNextDayJst = startOfDayJst.add(1, 'day')
  const events = (
    await prisma.event.findMany({
      where: {
        isVerified: true,
        startDate: { gte: startOfDayJst.toDate(), lt: startOfNextDayJst.toDate() }
      },
      include: { conditions: true, stores: true },
      orderBy: { startDate: 'asc' }
    })
  ).map((v) => transform(v))
  const result = EventSchema.array().safeParse(events)
  if (!result.success) throw new HTTPException(400, { message: result.error.message })
  return result.data
}
