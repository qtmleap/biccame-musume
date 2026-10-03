import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
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
