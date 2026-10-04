import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import type { BotRpc, DeliveryResult } from '@biccame/shared/bot'
import type { PrismaClient } from '@/generated/prisma/client'
import * as prismaModule from '@/lib/prisma'
import { EventDetailSchema } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'
import routes from '../../workers/app/src/api/event'
import { eventRequest, makeEventPrisma } from '../fixtures/event-announcement'

const makeBot = () =>
  ({
    ping: async (input) => ({
      requestId: input.requestId,
      service: 'bot',
      phase: 'posting',
      notificationsEnabled: false
    }),
    accountStatus: async () => ({ ok: false, kind: 'disabled' }),
    postingSessionStatus: async () => ({ ok: false, kind: 'disabled' }),
    announce: mock(async (): Promise<DeliveryResult> => ({ status: 'sent', tweetId: '12345' }))
  }) satisfies BotRpc
let prisma: ReturnType<typeof makeEventPrisma>
let prismaSpy: ReturnType<typeof spyOn>
let bot: ReturnType<typeof makeBot>
beforeEach(() => {
  prisma = makeEventPrisma()
  prismaSpy = spyOn(prismaModule, 'getPrisma').mockReturnValue(prisma as unknown as PrismaClient)
  bot = makeBot()
})
afterEach(() => prismaSpy.mockRestore())
const post = (shouldTweet = true) =>
  routes.request(
    '/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...eventRequest, shouldTweet })
    },
    { ENVIRONMENT: 'local', BOT: bot } as unknown as Bindings
  )
const assertDetail = async (response: Response) => {
  expect(response.status).toBe(201)
  const body = await response.json()
  expect(EventDetailSchema.safeParse(body).success).toBe(true)
  expect(EventDetailSchema.parse(body).uuid).toBe(eventRequest.uuid)
  expect(body).not.toHaveProperty('created')
  expect(body).not.toHaveProperty('event')
  return body
}

test('same_uuid_posts_announcement_once', async () => {
  const first = await assertDetail(await post())
  const second = await assertDetail(await post())
  expect(second).toEqual(first)
  expect(prisma.event.create).toHaveBeenCalledTimes(1)
  expect(bot.announce).toHaveBeenCalledTimes(1)
})
test('concurrent_uuid_has_one_announcement', async () => {
  for (const response of await Promise.all([post(), post()])) await assertDetail(response)
  expect(bot.announce).toHaveBeenCalledTimes(1)
  expect(prisma.event.create).toHaveBeenCalledTimes(2)
})
test('RPC failure does not roll back persistence or duplicate the event', async () => {
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  try {
    bot.announce.mockRejectedValueOnce(new Error('secret-like-RPC-detail'))
    await assertDetail(await post())
    await assertDetail(await post())
    expect(prisma.event.create).toHaveBeenCalledTimes(1)
    expect(bot.announce).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(errors.mock.calls)).not.toContain('secret-like-RPC-detail')
  } finally {
    errors.mockRestore()
  }
})
test('shouldTweet_false_suppresses_creation_and_later_retry', async () => {
  await assertDetail(await post(false))
  await assertDetail(await post(true))
  expect(prisma.event.create).toHaveBeenCalledTimes(1)
  expect(bot.announce).not.toHaveBeenCalled()
})
test('unknown delivery is not automatically resent on UUID retry', async () => {
  bot.announce.mockResolvedValueOnce({ status: 'unknown', kind: 'network' })
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await assertDetail(await post())
    await assertDetail(await post())
    expect(prisma.event.create).toHaveBeenCalledTimes(1)
    expect(bot.announce).toHaveBeenCalledTimes(1)
  } finally {
    errors.mockRestore()
  }
})
