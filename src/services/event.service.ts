import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import type { EventRequest } from '@/schemas/event.dto'

/**
 * D1データベースからPrismaクライアントを生成する
 * @param db D1Database インスタンス
 * @returns PrismaClient インスタンス
 */
export const createPrismaClient = (db: D1Database) => {
  const adapter = new PrismaD1(db)
  return new PrismaClient({ adapter })
}

/**
 * イベント一覧を取得する
 * @param prisma PrismaClient インスタンス
 * @returns イベント一覧
 */
export const listEvents = async (prisma: PrismaClient) => {
  const events = await prisma.event.findMany({
    include: {
      conditions: true,
      referenceUrls: true,
      stores: true
    },
    orderBy: { startDate: 'desc' }
  })

  return events.map(transformEventFromDb)
}

/**
 * イベントをIDで取得する
 * @param prisma PrismaClient インスタンス
 * @param id イベントID
 * @returns イベント or null
 */
export const getEventById = async (prisma: PrismaClient, id: string) => {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      conditions: true,
      referenceUrls: true,
      stores: true
    }
  })

  return event ? transformEventFromDb(event) : null
}

/**
 * URLで重複するイベントを検索する
 * @param prisma PrismaClient インスタンス
 * @param url 検索するURL
 * @param excludeId 除外するイベントID
 * @returns 該当イベント or null
 */
export const findEventByUrl = async (prisma: PrismaClient, url: string, excludeId?: string) => {
  const referenceUrl = await prisma.eventReferenceUrl.findFirst({
    where: {
      url,
      ...(excludeId ? { eventId: { not: excludeId } } : {})
    },
    include: {
      event: {
        include: {
          conditions: true,
          referenceUrls: true,
          stores: true
        }
      }
    }
  })

  return referenceUrl ? transformEventFromDb(referenceUrl.event) : null
}

/**
 * 新しいイベントを作成する
 * @param prisma PrismaClient インスタンス
 * @param data イベントリクエストデータ
 * @returns 作成されたイベント
 */
export const createEvent = async (prisma: PrismaClient, data: EventRequest) => {
  const event = await prisma.event.create({
    data: {
      category: data.category,
      name: data.name,
      limitedQuantity: data.limitedQuantity,
      startDate: dayjs(data.startDate).toDate(),
      endDate: data.endDate ? dayjs(data.endDate).toDate() : null,
      endedAt: data.endedAt ? dayjs(data.endedAt).toDate() : null,
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
        create: data.stores.map((storeName) => ({ storeKey: storeName }))
      }
    },
    include: {
      conditions: true,
      referenceUrls: true,
      stores: true
    }
  })

  return transformEventFromDb(event)
}

/**
 * イベントを更新する
 * @param prisma PrismaClient インスタンス
 * @param id イベントID
 * @param data 更新データ
 * @returns 更新されたイベント or null
 */
export const updateEvent = async (prisma: PrismaClient, id: string, data: Partial<EventRequest>) => {
  // 既存イベントの存在確認
  const existingEvent = await prisma.event.findUnique({ where: { id } })
  if (!existingEvent) return null

  // 関連データを削除してから再作成（条件、URL、店舗）
  if (data.conditions) {
    await prisma.eventCondition.deleteMany({ where: { eventId: id } })
  }
  if (data.referenceUrls !== undefined) {
    await prisma.eventReferenceUrl.deleteMany({ where: { eventId: id } })
  }
  if (data.stores) {
    await prisma.eventStore.deleteMany({ where: { eventId: id } })
  }

  // イベント本体と関連データを更新
  const event = await prisma.event.update({
    where: { id },
    data: {
      ...(data.category && { category: data.category }),
      ...(data.name && { name: data.name }),
      ...(data.limitedQuantity !== undefined && { limitedQuantity: data.limitedQuantity }),
      ...(data.startDate && { startDate: dayjs(data.startDate).toDate() }),
      // endDateが明示的にundefinedの場合はnullに設定
      ...('endDate' in data && { endDate: data.endDate ? dayjs(data.endDate).toDate() : null }),
      ...('endedAt' in data && { endedAt: data.endedAt ? dayjs(data.endedAt).toDate() : null }),
      ...(data.conditions && {
        conditions: {
          create: data.conditions.map((c) => ({
            type: c.type,
            purchaseAmount: c.purchaseAmount,
            quantity: c.quantity
          }))
        }
      }),
      ...(data.referenceUrls !== undefined && {
        referenceUrls: {
          create: data.referenceUrls.map((r) => ({
            type: r.type,
            url: r.url
          }))
        }
      }),
      ...(data.stores && {
        stores: {
          create: data.stores.map((storeName) => ({ storeKey: storeName }))
        }
      })
    },
    include: {
      conditions: true,
      referenceUrls: true,
      stores: true
    }
  })

  return transformEventFromDb(event)
}

/**
 * イベントを削除する
 * @param prisma PrismaClient インスタンス
 * @param id イベントID
 * @returns 削除成功したかどうか
 */
export const deleteEvent = async (prisma: PrismaClient, id: string): Promise<boolean> => {
  const existingEvent = await prisma.event.findUnique({ where: { id } })
  if (!existingEvent) return false

  await prisma.event.delete({ where: { id } })
  return true
}

/**
 * DBのイベントデータをAPIレスポンス形式に変換する
 */
const transformEventFromDb = (event: {
  id: string
  category: string
  name: string
  limitedQuantity: number | null
  startDate: Date
  endDate: Date | null
  endedAt: Date | null
  createdAt: Date
  updatedAt: Date
  conditions: Array<{
    type: string
    purchaseAmount: number | null
    quantity: number | null
  }>
  referenceUrls: Array<{
    type: string
    url: string
  }>
  stores: Array<{
    storeKey: string
  }>
}) => {
  return {
    id: event.id,
    category: event.category,
    name: event.name,
    limitedQuantity: event.limitedQuantity ?? undefined,
    startDate: dayjs(event.startDate).toISOString(),
    endDate: event.endDate ? dayjs(event.endDate).toISOString() : undefined,
    endedAt: event.endedAt ? dayjs(event.endedAt).toISOString() : undefined,
    createdAt: dayjs(event.createdAt).toISOString(),
    updatedAt: dayjs(event.updatedAt).toISOString(),
    conditions: event.conditions.map((c) => ({
      type: c.type,
      purchaseAmount: c.purchaseAmount ?? undefined,
      quantity: c.quantity ?? undefined
    })),
    referenceUrls: event.referenceUrls.map((r) => ({
      type: r.type,
      url: r.url
    })),
    stores: event.stores.map((s) => s.storeKey)
  }
}
