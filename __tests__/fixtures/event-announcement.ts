import { mock } from 'bun:test'
import { Prisma } from '@/generated/prisma/client'
import type { EventRequest } from '@/schemas/event.dto'

export const eventRequest: EventRequest = {
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  category: 'limited_card',
  title: 'テストイベント',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-01-31T00:00:00.000Z',
  isVerified: true,
  isPreliminary: false,
  conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
  referenceUrls: [{ uuid: '22222222-2222-4222-a222-222222222222', type: 'announce', url: 'https://example.com/event' }],
  stores: ['akiba'],
  shouldTweet: true
}

export const eventRow = {
  id: eventRequest.uuid,
  category: eventRequest.category,
  title: eventRequest.title,
  limitedQuantity: null,
  startDate: new Date(eventRequest.startDate),
  endDate: new Date(eventRequest.endDate!),
  endedAt: null,
  isVerified: true,
  isPreliminary: false,
  groupId: null,
  characterId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  conditions: eventRequest.conditions.map((c) => ({ id: c.uuid, type: c.type, purchaseAmount: null, quantity: null })),
  referenceUrls: eventRequest.referenceUrls.map((r) => ({ id: r.uuid, type: r.type, url: r.url })),
  stores: eventRequest.stores.map((storeKey) => ({ storeKey })),
  comments: []
}

export const uniqueError = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['id'] }
  })

// Each lookup snapshots the stored row before yielding, so concurrent callers both
// observe absence. The second insert then encounters the real DB's UUID race.
export const makeEventPrisma = () => {
  let row: typeof eventRow | null = null
  const event = {
    findUnique: mock(async () => row),
    create: mock(async () => {
      if (row) throw uniqueError()
      row = eventRow
      return row
    })
  }
  return { event }
}
