import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import { HTTPException } from 'hono/http-exception'
import { nullToUndefined } from '@/lib/utils'
import { type Event, type EventRequest, EventSchema, EventStatusSchema } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'

const transform = (event: any): Event => {
  console.log(JSON.stringify(event, null, 2))
  return {
    ...nullToUndefined(event),
    stores: event.stores.map((s: any) => s.storeKey),
    status: EventStatusSchema.enum.ongoing,
    daysUntil: 0
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
  console.log(events.map((e) => e.stores))
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
