import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { HTTPException } from 'hono/http-exception'
import { nullToUndefined } from '@/lib/utils'
import { type Event, type EventRequest, EventSchema, type EventStatus, EventStatusSchema } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'
import { Twitter } from '@/utils/twitter'

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
 * @returns APIレスポンス用のEvent型オブジェクト
 */
// biome-ignore lint/suspicious/noExplicitAny: reason
const transform = (event: any): Event => {
  const { status, daysUntil } = calculateEventStatus(event)
  const { id, conditions, referenceUrls, ...rest } = event
  return {
    ...nullToUndefined(rest),
    uuid: id,
    // TODO: DBマイグレーション後に削除 - nameカラムをtitleにリネームする予定
    title: event.name,
    // biome-ignore lint/suspicious/noExplicitAny: reason
    conditions: conditions?.map((c: any) => ({ ...nullToUndefined(c), uuid: c.id })) || [],
    // biome-ignore lint/suspicious/noExplicitAny: reason
    referenceUrls: referenceUrls?.map((r: any) => ({ ...nullToUndefined(r), uuid: r.id })) || [],
    // biome-ignore lint/suspicious/noExplicitAny: reason
    stores: event.stores.map((s: any) => s.storeKey),
    status,
    daysUntil
  }
}

/**
 * 指定されたIDのイベントを取得
 * @param env - Cloudflare Workers環境変数
 * @param id - イベントのUUID
 * @returns イベント情報
 * @throws HTTPException 404 - イベントが見つからない場合
 */
export const getEvent = async (env: Bindings, id: string): Promise<Event> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      conditions: true,
      referenceUrls: true,
      stores: true
    }
  })
  if (event === null) {
    throw new HTTPException(404, { message: 'Not Found' })
  }
  return transform(event)
}

/**
 * 公開済みイベント一覧を取得（半年以内に開催されたもの）
 * @param env - Cloudflare Workers環境変数
 * @returns イベント一覧（開始日降順）
 * @throws HTTPException 400 - バリデーションエラーの場合
 */
export const getEvents = async (env: Bindings): Promise<Event[]> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })
  // 半年前の日付を計算
  const sixMonthsAgo = dayjs().subtract(6, 'month').toDate()

  const events = (
    await prisma.event.findMany({
      where: {
        isVerified: true,
        // 半年以内に開催されたイベントのみ取得
        startDate: { gte: sixMonthsAgo }
      },
      include: {
        conditions: true,
        referenceUrls: true,
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
 * 新規イベントを作成
 * 同一UUIDが存在する場合は既存イベントを返す（冪等性保証）
 * 作成成功時にTwitterへ自動投稿（shouldTweet=falseで無効化可能）
 * @param env - Cloudflare Workers環境変数
 * @param data - イベント作成リクエストデータ
 * @returns 作成されたイベント情報
 */
export const createEvent = async (env: Bindings, data: EventRequest): Promise<Event> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  // クライアント側でidが指定されている場合、既存イベントをチェック
  if (data.uuid) {
    const existingEvent = await prisma.event.findUnique({
      where: { id: data.uuid },
      include: {
        conditions: true,
        referenceUrls: true,
        stores: true
      }
    })

    if (existingEvent) {
      console.log('Event already exists with id:', data.uuid)
      return transform(existingEvent)
    }
  }

  // 日付をDate型に変換
  const startDate = new Date(data.startDate)
  const endDate = data.endDate ? new Date(data.endDate) : null
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  const event = await prisma.event.create({
    data: {
      id: data.uuid,
      category: data.category,
      name: data.title,
      limitedQuantity: data.limitedQuantity,
      startDate,
      endDate,
      endedAt,
      isVerified: data.isVerified ?? false,
      isPreliminary: data.isPreliminary ?? false,
      conditions: {
        create: data.conditions.map((c) => ({
          type: c.type,
          purchaseAmount: c.purchaseAmount,
          quantity: c.quantity
        }))
      },
      referenceUrls: {
        create:
          data.referenceUrls?.map((r) => ({
            type: r.type,
            url: r.url
          })) || []
      },
      stores: {
        create: data.stores.map((name) => ({ storeKey: name }))
      }
    },
    include: {
      conditions: true,
      referenceUrls: true,
      stores: true
    }
  })
  const transformedEvent = transform(event)

  // イベント作成をツイート（エラーがあっても処理は継続）
  if (data.shouldTweet !== false) {
    try {
      await new Twitter(env).tweetEventCreated(transformedEvent)
    } catch (error) {
      console.error('Failed to tweet event creation:', error)
    }
  }

  return transformedEvent
}

/**
 * 既存イベントを更新
 * 関連データ（conditions, referenceUrls, stores）は全て置換される
 * 更新成功時にTwitterへ自動投稿（shouldTweet=falseで無効化可能）
 * @param env - Cloudflare Workers環境変数
 * @param data - イベント更新リクエストデータ（uuidが必須）
 * @returns 更新されたイベント情報
 */
export const updateEvent = async (env: Bindings, data: EventRequest): Promise<Event> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  // 日付をDate型に変換
  const startDate = new Date(data.startDate)
  const endDate = data.endDate ? new Date(data.endDate) : null
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  const event = await prisma.event.update({
    where: { id: data.uuid },
    data: {
      category: data.category,
      name: data.title,
      limitedQuantity: data.limitedQuantity,
      startDate,
      endDate,
      endedAt,
      isVerified: data.isVerified,
      isPreliminary: data.isPreliminary,
      conditions: {
        deleteMany: {},
        create: data.conditions.map((c) => ({
          id: c.uuid,
          type: c.type,
          purchaseAmount: c.purchaseAmount,
          quantity: c.quantity
        }))
      },
      referenceUrls: {
        deleteMany: {},
        create:
          data.referenceUrls?.map((r) => ({
            id: r.uuid,
            type: r.type,
            url: r.url
          })) || []
      },
      stores: {
        deleteMany: {},
        create: data.stores.map((storeName) => ({ storeKey: storeName }))
      }
    },
    include: {
      conditions: true,
      referenceUrls: true,
      stores: true
    }
  })

  const transformedEvent = transform(event)

  // イベント更新をツイート（エラーがあっても処理は継続）
  if (data.shouldTweet !== false) {
    try {
      await new Twitter(env).tweetEventUpdated(transformedEvent)
    } catch (error) {
      console.error('Failed to tweet event update:', error)
    }
  }

  return transformedEvent
}

/**
 * イベントを削除
 * 関連データ（conditions, referenceUrls, stores）もカスケード削除される
 * @param env - Cloudflare Workers環境変数
 * @param id - 削除するイベントのUUID
 * @returns null
 */
export const deleteEvent = async (env: Bindings, id: string): Promise<null> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })
  await prisma.event.delete({ where: { id: id } })
  return null
}
