import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { PrismaClient } from '@/generated/prisma/client'
import * as prismaModule from '@/lib/prisma'
import type { Bindings } from '@/types/bindings'
import routes from '../../workers/app/src/api/event'
import { getEventsStats } from '../../workers/app/src/services/me-service'

const groupBy = mock(async (input: { where: { eventId: { in: string[] }; status: string } }) =>
  input.where.eventId.in.map((eventId) => ({ eventId, _count: { eventId: 2 } }))
)
let prismaSpy: ReturnType<typeof spyOn>
beforeEach(() => {
  groupBy.mockClear()
  prismaSpy = spyOn(prismaModule, 'getPrisma').mockReturnValue({ userEvent: { groupBy } } as unknown as PrismaClient)
})
afterEach(() => prismaSpy.mockRestore())
const env = {} as Bindings
const post = (eventIds: string[]) => {
  const app = new OpenAPIHono<{ Bindings: Bindings }>()
  app.route('/api/events', routes)
  return app.request(
    '/api/events/stats',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventIds })
    },
    env
  )
}
test('stats_over_limit_is_rejected', async () => {
  const response = await post(Array.from({ length: 51 }, (_, i) => `event-${i}`))
  expect(response.status).toBe(400)
  expect(groupBy).not.toHaveBeenCalled()
})
test('stats_deduplicates_before_limit_and_queries', async () => {
  const ids = Array.from({ length: 50 }, (_, i) => `event-${i}`)
  const response = await post([...ids, ...ids])
  expect(response.status).toBe(200)
  expect(Object.keys(await response.json())).toHaveLength(50)
  for (const [input] of groupBy.mock.calls) expect(input.where.eventId.in).toHaveLength(50)
})
test('stats_rejects_long_or_empty_ids_before_db', async () => {
  for (const id of ['', 'a'.repeat(101)]) expect((await post([id])).status).toBe(400)
  expect(groupBy).not.toHaveBeenCalled()
})
test('internal_stats_batches_large_groups_without_losing_counts', async () => {
  const ids = Array.from({ length: 123 }, (_, i) => `event-${i}`)
  const result = await getEventsStats(env, [...ids, ids[0]])
  expect(Object.keys(result)).toHaveLength(123)
  expect(result['event-122']).toEqual({ interestedCount: 2, completedCount: 2 })
  expect(groupBy).toHaveBeenCalledTimes(6)
  for (const [input] of groupBy.mock.calls) expect(input.where.eventId.in.length).toBeLessThanOrEqual(50)
})
test('empty_stats_does_not_query_db', async () => {
  expect(await getEventsStats(env, [])).toEqual({})
  expect(groupBy).not.toHaveBeenCalled()
})
