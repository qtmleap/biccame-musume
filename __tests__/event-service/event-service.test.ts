import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import type { PrismaClient } from '@/generated/prisma/client'
import * as prismaModule from '@/lib/prisma'
import { createEvent } from '@/services/event-service'
import type { Bindings } from '@/types/bindings'
import { eventRequest, eventRow, makeEventPrisma, uniqueError } from '../fixtures/event-announcement'

const env = {} as Bindings
let prisma: ReturnType<typeof makeEventPrisma>
let prismaSpy: ReturnType<typeof spyOn>
beforeEach(() => {
  prisma = makeEventPrisma()
  prismaSpy = spyOn(prismaModule, 'getPrisma').mockReturnValue(prisma as unknown as PrismaClient)
})
afterEach(() => prismaSpy.mockRestore())

describe('createEvent — 冪等性', () => {
  test('same_uuid_has_one_creator', async () => {
    const first = await createEvent(env, eventRequest)
    const second = await createEvent(env, eventRequest)
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.event.uuid).toBe(eventRequest.uuid)
    expect(second.event.title).toBe(eventRequest.title)
    expect(prisma.event.create).toHaveBeenCalledTimes(1)
    expect(prisma.event.findUnique).toHaveBeenCalledTimes(2)
  })

  test('concurrent_uuid_has_one_creator', async () => {
    const results = await Promise.allSettled([createEvent(env, eventRequest), createEvent(env, eventRequest)])
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled'])
    const events = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    expect(events.map((result) => result.created).sort()).toEqual([false, true])
    expect(events.map((result) => result.event.uuid)).toEqual([eventRow.id, eventRow.id])
    expect(prisma.event.create).toHaveBeenCalledTimes(2)
  })

  test('unrelated_database_errors_propagate', async () => {
    const error = new Error('database unavailable')
    prisma.event.create.mockRejectedValueOnce(error)
    await expect(createEvent(env, eventRequest)).rejects.toBe(error)
    expect(prisma.event.findUnique).toHaveBeenCalledTimes(1)
  })

  test('unique_conflict_without_existing_uuid_propagates', async () => {
    const error = uniqueError()
    prisma.event.create.mockRejectedValueOnce(error)
    await expect(createEvent(env, eventRequest)).rejects.toBe(error)
  })
})
