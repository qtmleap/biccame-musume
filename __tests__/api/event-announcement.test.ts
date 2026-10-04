import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import type { BotRpc, DeliveryResult } from '@biccame/shared/bot'
import type { PrismaClient } from '@/generated/prisma/client'
import * as prismaModule from '@/lib/prisma'
import { EventDetailSchema } from '@/schemas/event.dto'
import type { Bindings } from '@/types/bindings'
import { Twitter } from '@/utils/twitter'
import routes from '../../workers/app/src/api/event'
import { eventRequest, makeEventPrisma } from '../fixtures/event-announcement'

let prisma: ReturnType<typeof makeEventPrisma>
let prismaSpy: ReturnType<typeof spyOn>
let tweetSpy: ReturnType<typeof spyOn>
const tweet = mock(async () => {})
beforeEach(() => {
  prisma = makeEventPrisma()
  prismaSpy = spyOn(prismaModule, 'getPrisma').mockReturnValue(prisma as unknown as PrismaClient)
  tweet.mockReset()
  tweet.mockImplementation(async () => {})
  tweetSpy = spyOn(Twitter.prototype, 'tweetEventCreated').mockImplementation(tweet)
})
afterEach(() => {
  prismaSpy.mockRestore()
  tweetSpy.mockRestore()
})
const post = (shouldTweet = true) =>
  routes.request(
    '/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...eventRequest, shouldTweet })
    },
    { ENVIRONMENT: 'local' } as Bindings
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
  expect(tweet).toHaveBeenCalledTimes(1)
})

test('concurrent_uuid_has_one_announcement', async () => {
  const responses = await Promise.all([post(), post()])
  for (const response of responses) await assertDetail(response)
  expect(tweet).toHaveBeenCalledTimes(1)
})

test('tweet_failure_does_not_duplicate_event', async () => {
  const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
  try {
    tweet.mockRejectedValueOnce(new Error('stubbed announcement failure'))
    await assertDetail(await post())
    await assertDetail(await post())
    expect(prisma.event.create).toHaveBeenCalledTimes(1)
    expect(tweet).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  } finally {
    errorSpy.mockRestore()
  }
})

test('shouldTweet_false_suppresses_creation_and_later_retry', async () => {
  await assertDetail(await post(false))
  await assertDetail(await post(true))
  expect(prisma.event.create).toHaveBeenCalledTimes(1)
  expect(tweet).not.toHaveBeenCalled()
})

const botPost = (bot: BotRpc, shouldTweet = true) =>
  routes.request(
    '/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...eventRequest, shouldTweet })
    },
    { ENVIRONMENT: 'local', X_POSTING_OWNER: 'bot', BOT: bot } as Bindings
  )
const makeBot = () =>
  ({
    ping: async (input) => ({
      requestId: input.requestId,
      service: 'bot',
      phase: 'posting',
      notificationsEnabled: false
    }),
    accountStatus: async () => ({ ok: false, kind: 'disabled' }),
    announce: mock(async (): Promise<DeliveryResult> => ({ status: 'sent', tweetId: '12345' }))
  }) satisfies BotRpc

test('bot ownership preserves UUID retry/concurrency suppression and never calls legacy posting', async () => {
  const bot = makeBot()
  for (const response of await Promise.all([botPost(bot), botPost(bot)])) await assertDetail(response)
  await assertDetail(await botPost(bot))
  expect(bot.announce).toHaveBeenCalledTimes(1)
  // 同時insertの片方はP2002になるが、保存済みUUIDへの通知は1回だけ。
  expect(prisma.event.create).toHaveBeenCalledTimes(2)
  expect(tweet).not.toHaveBeenCalled()
})

test('unknown bot delivery still returns saved event and is not resent on UUID retry', async () => {
  const bot = makeBot()
  bot.announce.mockResolvedValueOnce({ status: 'unknown', kind: 'network' })
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await assertDetail(await botPost(bot))
    await assertDetail(await botPost(bot))
    expect(bot.announce).toHaveBeenCalledTimes(1)
    expect(prisma.event.create).toHaveBeenCalledTimes(1)
    expect(tweet).not.toHaveBeenCalled()
  } finally {
    errors.mockRestore()
  }
})

test('bot RPC exceptions do not leak and cannot roll back event persistence', async () => {
  const bot = makeBot()
  bot.announce.mockRejectedValueOnce(new Error('secret-like-RPC-detail'))
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await assertDetail(await botPost(bot))
    expect(JSON.stringify(errors.mock.calls)).not.toContain('secret-like-RPC-detail')
    expect(tweet).not.toHaveBeenCalled()
  } finally {
    errors.mockRestore()
  }
})

test('shouldTweet false also suppresses bot RPC and subsequent duplicate retry', async () => {
  const bot = makeBot()
  await assertDetail(await botPost(bot, false))
  await assertDetail(await botPost(bot, true))
  expect(bot.announce).not.toHaveBeenCalled()
  expect(tweet).not.toHaveBeenCalled()
})
