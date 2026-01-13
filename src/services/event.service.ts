import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { HTTPException } from 'hono/http-exception'
import { nullToUndefined } from '@/lib/utils'
import { type Event, type EventRequest, EventSchema, type EventStatus, EventStatusSchema } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * イベントのステータスと残り日数を計算
 */
const calculateEventStatus = (event: {
  startDate: Date
  endDate: Date | null
  endedAt: Date | null
}): { status: EventStatus; daysUntil: number } => {
  const now = dayjs().startOf('day')
  const startDate = dayjs(event.startDate).startOf('day')
  const endDate = event.endDate ? dayjs(event.endDate).startOf('day') : null
  const endedAt = event.endedAt ? dayjs(event.endedAt) : null

  // 実際の終了日時が設定されている場合は終了
  if (endedAt) {
    return { status: EventStatusSchema.enum.ended, daysUntil: 0 }
  }

  // 開始前
  if (now.isBefore(startDate)) {
    return { status: EventStatusSchema.enum.upcoming, daysUntil: startDate.diff(now, 'day') }
  }

  // 終了日が設定されていて、終了日を過ぎている場合
  if (endDate && now.isAfter(endDate)) {
    return { status: EventStatusSchema.enum.ended, daysUntil: 0 }
  }

  // 開催中
  if (endDate) {
    return { status: EventStatusSchema.enum.ongoing, daysUntil: endDate.diff(now, 'day') }
  }

  // 終了日未定で開催中
  return { status: EventStatusSchema.enum.ongoing, daysUntil: 0 }
}

// biome-ignore lint/suspicious/noExplicitAny: reason
const transform = (event: any): Event => {
  const { status, daysUntil } = calculateEventStatus(event)
  return {
    ...nullToUndefined(event),
    // biome-ignore lint/suspicious/noExplicitAny: reason
    stores: event.stores.map((s: any) => s.storeKey),
    status,
    daysUntil
  }
}

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

export const getEvents = async (env: Bindings): Promise<Event[]> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })
  const events = (
    await prisma.event.findMany({
      where: { isVerified: true },
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

export const createEvent = async (env: Bindings, data: EventRequest): Promise<Event> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })
  const event = await prisma.event.create({
    data: {
      category: data.category,
      name: data.name,
      limitedQuantity: data.limitedQuantity,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      endedAt: data.endedAt ?? null,
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
  return transform(event)
}

export const updateEvent = async (env: Bindings, id: string, data: EventRequest): Promise<Event> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })

  const event = await prisma.event.update({
    where: { id },
    data: {
      category: data.category,
      name: data.name,
      limitedQuantity: data.limitedQuantity,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      endedAt: data.endedAt ?? null,
      isVerified: data.isVerified,
      isPreliminary: data.isPreliminary,
      conditions: {
        deleteMany: {},
        create: data.conditions.map((c) => ({
          id: c.id,
          type: c.type,
          purchaseAmount: c.purchaseAmount,
          quantity: c.quantity
        }))
      },
      referenceUrls: {
        deleteMany: {},
        create:
          data.referenceUrls?.map((r) => ({
            id: r.id,
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

  return transform(event)
}

export const deleteEvent = async (env: Bindings, id: string): Promise<null> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) })
  await prisma.event.delete({ where: { id: id } })
  return null
}
