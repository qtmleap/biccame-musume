import type { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import type { EventRequest } from '@/schemas/event.dto'

/**
 * イベント一覧を取得する
 * @param prisma PrismaClient インスタンス
 * @returns イベント一覧
 */
export const listEvents = async (prisma: PrismaClient) => {
  console.log('[Service] listEvents called, prisma client:', prisma ? 'exists' : 'NOT FOUND')

  try {
    const events = await prisma.event.findMany({
      include: {
        conditions: true,
        referenceUrls: true,
        stores: true
      },
      orderBy: { startDate: 'desc' }
    })

    console.log('[Service] Raw events from DB:', events.length)
    const transformed = events.map(transformEventFromDb)
    console.log('[Service] Transformed events:', transformed.length)
    return transformed
  } catch (error) {
    console.error('[Service] Error in listEvents:', error)
    throw error
  }
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
  console.log('[Service] Update event started:', { id, dataKeys: Object.keys(data) })
  console.log('[Service] Update data:', JSON.stringify(data, null, 2))

  // 既存イベントの存在確認
  const existingEvent = await prisma.event.findUnique({ where: { id } })
  if (!existingEvent) {
    console.error('[Service] Event not found:', id)
    return null
  }
  console.log('[Service] Existing event found:', { id, name: existingEvent.name })

  // 関連データを削除してから再作成（条件、URL、店舗）
  if (data.conditions) {
    console.log('[Service] Deleting existing conditions...')
    await prisma.eventCondition.deleteMany({ where: { eventId: id } })
    console.log('[Service] Conditions deleted, will create', data.conditions.length, 'new ones')
  }
  if (data.referenceUrls !== undefined) {
    console.log('[Service] Deleting existing reference URLs...')
    await prisma.eventReferenceUrl.deleteMany({ where: { eventId: id } })
    console.log('[Service] Reference URLs deleted, will create', data.referenceUrls.length, 'new ones')
  }
  if (data.stores) {
    console.log('[Service] Deleting existing stores...')
    await prisma.eventStore.deleteMany({ where: { eventId: id } })
    console.log('[Service] Stores deleted, will create', data.stores.length, 'new ones')
  }

  // イベント本体と関連データを更新
  const updateData = {
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
  }

  console.log('[Service] Update data structure:', JSON.stringify(updateData, null, 2))
  console.log('[Service] Executing Prisma update...')

  try {
    const event = await prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        conditions: true,
        referenceUrls: true,
        stores: true
      }
    })

    console.log('[Service] Event updated successfully:', {
      id: event.id,
      name: event.name,
      conditionsCount: event.conditions.length,
      referenceUrlsCount: event.referenceUrls.length,
      storesCount: event.stores.length
    })

    return transformEventFromDb(event)
  } catch (error) {
    console.error('[Service] Error updating event:', error)
    throw error
  }
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
  const now = dayjs()
  const startDate = dayjs(event.startDate)
  const endDate = event.endedAt ? dayjs(event.endedAt) : event.endDate ? dayjs(event.endDate) : null

  // statusを計算
  let status: 'upcoming' | 'ongoing' | 'ended'
  if (event.endedAt || (endDate && now.isAfter(endDate))) {
    status = 'ended'
  } else if (now.isBefore(startDate)) {
    status = 'upcoming'
  } else {
    status = 'ongoing'
  }

  // daysUntilを計算
  const daysUntil = startDate.diff(now, 'day')

  return {
    id: event.id,
    category: event.category as 'limited_card' | 'regular_card' | 'ackey' | 'other',
    name: event.name,
    limitedQuantity: event.limitedQuantity ?? undefined,
    startDate: dayjs(event.startDate).toISOString(),
    endDate: event.endDate ? dayjs(event.endDate).toISOString() : undefined,
    endedAt: event.endedAt ? dayjs(event.endedAt).toISOString() : undefined,
    createdAt: dayjs(event.createdAt).toISOString(),
    updatedAt: dayjs(event.updatedAt).toISOString(),
    status,
    daysUntil,
    conditions: event.conditions.map((c) => ({
      type: c.type as 'purchase' | 'first_come' | 'lottery' | 'everyone',
      purchaseAmount: c.purchaseAmount ?? undefined,
      quantity: c.quantity ?? undefined
    })),
    referenceUrls: event.referenceUrls.map((r) => ({
      type: r.type as 'announce' | 'start' | 'end',
      url: r.url
    })),
    stores: event.stores.map((s) => s.storeKey) as Array<
      | 'abeno'
      | 'akasaka'
      | 'akiba'
      | 'biccamera'
      | 'bicqlo'
      | 'bicsim'
      | 'camera'
      | 'chiba'
      | 'chofu'
      | 'fujisawa'
      | 'funabashi'
      | 'funato'
      | 'hachioji'
      | 'hamamatsu'
      | 'hiroshima'
      | 'honten'
      | 'ikenishi'
      | 'kagoshima'
      | 'kashiwa'
      | 'kawasaki'
      | 'kyoto'
      | 'machida'
      | 'mito'
      | 'nagoya'
      | 'nagoyagate'
      | 'naisen'
      | 'nanba'
      | 'niigata'
      | 'oeraitan'
      | 'ohmiya'
      | 'okayama'
      | 'photo'
      | 'pkan'
      | 'prosta'
      | 'sagami'
      | 'sapporo'
      | 'seiseki'
      | 'shibuhachi'
      | 'shibuto'
      | 'shinjyuku'
      | 'shintou'
      | 'shinyoko'
      | 'tachikawa'
      | 'takatsuki'
      | 'tamapla'
      | 'tenjin'
      | 'tenjin2'
      | 'tokorozawa'
      | 'yao'
      | 'yuurakuchou'
    >
  }
}
