import { expect, mock, test } from 'bun:test'
import type { BotRpc, DailyTargetsResult, DeliveryResult } from '@biccame/shared/bot'
import { z } from 'zod'
import { EventDetailSchema } from '../workers/app/src/schemas/event.dto'
import { runBadgeCron } from '../workers/app/src/services/badge-cron'
import { readPostingAccount } from '../workers/app/src/services/bot-account'
import { announceSavedEvent } from '../workers/app/src/services/bot-announcement'
import { readBotDailyTargets } from '../workers/app/src/services/bot-daily-targets'
import type { Bindings } from '../workers/app/src/types/bindings'
import {
  buildDailySummaryTweets,
  buildEndingTodaySummaryTweets,
  buildEventCreatedText
} from '../workers/app/src/utils/tweet-text'
import { eventRequest } from './fixtures/event-announcement'

const parsedEvent = EventDetailSchema.safeParse({
  ...eventRequest,
  startDate: '2026-10-03T00:00:00Z',
  endDate: '2026-10-03T00:00:00Z',
  createdAt: '2026-10-03T00:00:00Z',
  updatedAt: '2026-10-03T00:00:00Z',
  status: 'last_day',
  daysUntil: 0,
  interestedCount: 0,
  completedCount: 0,
  comments: []
})
if (!parsedEvent.success) throw new Error('Invalid synthetic event')
const event = parsedEvent.data
const makeBot = () =>
  ({
    ping: mock(async (input) => ({
      requestId: input.requestId,
      service: 'bot' as const,
      phase: 'posting' as const,
      notificationsEnabled: false
    })),
    announce: mock(async (): Promise<DeliveryResult> => ({ status: 'sent', tweetId: '12345' })),
    accountStatus: mock(async () => ({ ok: false as const, kind: 'disabled' as const })),
    postingSessionStatus: mock(async () => ({ ok: false as const, kind: 'disabled' as const }))
  }) satisfies BotRpc
const env = (bot: BotRpc) => ({ X_POSTING_OWNER: 'bot', BOT: bot }) as Bindings

test('app announcement passes only purpose/UUID/revision/rendered text and no Prisma model or Date', async () => {
  const bot = makeBot()
  await announceSavedEvent(env(bot), event, 'created')
  expect(bot.announce).toHaveBeenCalledWith({
    eventUUID: event.uuid,
    revision: event.updatedAt.toISOString(),
    purpose: 'created',
    text: buildEventCreatedText(event),
    quoteTweetId: undefined
  })
  expect(JSON.stringify(bot.announce.mock.calls)).not.toContain('conditions')
})

test.each(['failed', 'unknown', 'disabled'] as const)(
  'app never falls back to direct posting when bot returns %s',
  async (status) => {
    const bot = makeBot()
    bot.announce.mockResolvedValue(status === 'disabled' ? { status } : { status, kind: 'network' })
    await expect(announceSavedEvent(env(bot), event, 'created')).rejects.toThrow(
      `Event announcement not sent: ${status}`
    )
    expect(bot.announce).toHaveBeenCalledTimes(1)
  }
)

test('RPC exception details do not escape and are treated as delivery unknown', async () => {
  const bot = makeBot()
  bot.announce.mockRejectedValueOnce(new Error('secret-like-details'))
  await expect(announceSavedEvent(env(bot), event, 'updated')).rejects.toThrow('outcome unknown: RPC failure')
  expect(bot.announce).toHaveBeenCalledTimes(1)
})

test('app-owned daily reads are disabled; bot-owned reads reuse existing JST services and text builders', async () => {
  const starting = mock(async () => [event])
  const ending = mock(async () => [event])
  const scheduledAt = '2026-10-03T00:00:00Z'
  expect(
    await readBotDailyTargets({ X_POSTING_OWNER: 'app' } as Bindings, { scheduledAt }, { starting, ending })
  ).toEqual({ ok: false, kind: 'disabled' })
  expect(starting).not.toHaveBeenCalled()
  const bindings = env(makeBot())
  const result = await readBotDailyTargets(bindings, { scheduledAt }, { starting, ending })
  expect(starting).toHaveBeenCalledWith(bindings, new Date(scheduledAt))
  expect(ending).toHaveBeenCalledWith(bindings, new Date(scheduledAt))
  expect(result).toEqual({
    ok: true,
    targets: {
      scheduledAt,
      starting: { eventUUIDs: [event.uuid], texts: buildDailySummaryTweets([event]) },
      ending: { eventUUIDs: [event.uuid], texts: buildEndingTodaySummaryTweets([event]) }
    }
  } satisfies DailyTargetsResult)
  expect(JSON.stringify(result)).not.toContain('createdAt')
})

test('invalid date or DB failures return a fixed contract without raw errors', async () => {
  const starting = mock(async () => {
    throw new Error('private-db-error')
  })
  const ending = mock(async () => [])
  expect(await readBotDailyTargets(env(makeBot()), { scheduledAt: new Date() }, { starting, ending })).toEqual({
    ok: false,
    kind: 'unavailable'
  })
  expect(starting).not.toHaveBeenCalled()
  expect(
    await readBotDailyTargets(env(makeBot()), { scheduledAt: '2026-10-03T00:00:00Z' }, { starting, ending })
  ).toEqual({ ok: false, kind: 'unavailable' })
})

test('profile RPC is read-only and reports a fixed failure rather than internal exceptions', async () => {
  const bot = makeBot()
  await expect(readPostingAccount(env(bot))).rejects.toThrow('X account status unavailable: disabled')
  bot.accountStatus.mockRejectedValueOnce(new Error('secret-like-profile'))
  await expect(readPostingAccount(env(bot))).rejects.toThrow('X account status unavailable: RPC failure')
  expect(bot.announce).not.toHaveBeenCalled()
})

test('badge-only cron invokes its own task and does not require bot availability', async () => {
  const run = mock(async () => {})
  const time = new Date('2026-10-03T00:00:00Z')
  const bindings = { X_POSTING_OWNER: 'bot' } as Bindings
  await runBadgeCron(bindings, time, run)
  expect(run).toHaveBeenCalledWith(bindings, time)
})

test('transport schemas accept only explicit ISO dates, not arbitrary classes', () => {
  const date = z.iso.datetime().safeParse(new Date())
  expect(date.success).toBe(false)
})
