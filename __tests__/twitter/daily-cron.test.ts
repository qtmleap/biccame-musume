import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import type { Event } from '../../workers/app/src/schemas/event.dto'
import { type DailyCronDependencies, runDailyCron } from '../../workers/app/src/services/daily-cron'
import { TwitterHealthError } from '../../workers/app/src/utils/twitter-health'

const now = new Date('2026-10-03T00:00:00Z')
const env = {} as never
const events: Event[] = [
  {
    uuid: '11111111-1111-4111-8111-111111111111',
    category: 'limited_card',
    title: '監視テストのイベント',
    stores: ['sagami'],
    startDate: now,
    endDate: now,
    conditions: [],
    isVerified: true,
    isPreliminary: false,
    status: 'last_day',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0,
    createdAt: now,
    updatedAt: now
  }
]

const dependencies = () =>
  ({
    twitter: {
      checkAuthenticatedSession: mock(async () => {}),
      tweetDailySummary: mock(async (_events: Event[]) => {}),
      tweetEndingTodaySummary: mock(async (_events: Event[]) => {})
    },
    startingToday: mock(async () => events),
    endingToday: mock(async () => events),
    notify: mock(async () => 'sent' as const),
    reevaluateBadges: mock(async () => {})
  }) satisfies DailyCronDependencies

afterEach(() => {
  spyOn(console, 'error').mockRestore()
})

test('checks authentication before both posts and preserves the scheduled date', async () => {
  const deps = dependencies()
  const sequence: string[] = []
  deps.twitter.checkAuthenticatedSession.mockImplementation(async () => {
    sequence.push('health')
  })
  deps.startingToday.mockImplementation(async () => {
    sequence.push('starting')
    return events
  })
  deps.endingToday.mockImplementation(async () => {
    sequence.push('ending')
    return events
  })
  await runDailyCron(env, now, deps)
  expect(sequence[0]).toBe('health')
  expect(deps.startingToday).toHaveBeenCalledWith(env, now)
  expect(deps.endingToday).toHaveBeenCalledWith(env, now)
  expect(deps.twitter.tweetDailySummary).toHaveBeenCalledWith(events)
  expect(deps.twitter.tweetEndingTodaySummary).toHaveBeenCalledWith(events)
  expect(deps.reevaluateBadges).toHaveBeenCalledTimes(1)
  expect(deps.notify).not.toHaveBeenCalled()
})

test('checks authentication even when there are no events', async () => {
  const deps = dependencies()
  deps.startingToday.mockResolvedValue([])
  deps.endingToday.mockResolvedValue([])
  await runDailyCron(env, now, deps)
  expect(deps.twitter.checkAuthenticatedSession).toHaveBeenCalledTimes(1)
  expect(deps.twitter.tweetDailySummary).not.toHaveBeenCalled()
  expect(deps.twitter.tweetEndingTodaySummary).not.toHaveBeenCalled()
  expect(deps.reevaluateBadges).toHaveBeenCalledTimes(1)
})

for (const kind of [
  'authentication',
  'account_mismatch',
  'missing_credentials',
  'signature',
  'rate_limit',
  'network'
] as const) {
  test(`notifies ${kind}, skips both posts, and continues badge evaluation`, async () => {
    const deps = dependencies()
    const failure = new TwitterHealthError(kind)
    deps.twitter.checkAuthenticatedSession.mockRejectedValue(failure)
    await runDailyCron(env, now, deps)
    expect(deps.notify).toHaveBeenCalledWith(env, failure, now)
    expect(deps.startingToday).not.toHaveBeenCalled()
    expect(deps.endingToday).not.toHaveBeenCalled()
    expect(deps.twitter.tweetDailySummary).not.toHaveBeenCalled()
    expect(deps.twitter.tweetEndingTodaySummary).not.toHaveBeenCalled()
    expect(deps.reevaluateBadges).toHaveBeenCalledTimes(1)
  })
}

test('an unexpected health exception does not leak secrets into notifications or logs', async () => {
  const deps = dependencies()
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  deps.twitter.checkAuthenticatedSession.mockRejectedValue(new Error('fixture-secret https://private.invalid'))
  await runDailyCron(env, now, deps)
  expect(deps.notify).toHaveBeenCalledWith(env, expect.objectContaining({ kind: 'unexpected_response' }), now)
  expect(JSON.stringify(deps.notify.mock.calls)).not.toContain('fixture-secret')
  expect(JSON.stringify(errors.mock.calls)).not.toContain('fixture-secret')
})

test('a Discord exception does not stop badge evaluation', async () => {
  const deps = dependencies()
  deps.twitter.checkAuthenticatedSession.mockRejectedValue(new TwitterHealthError('authentication'))
  deps.notify.mockRejectedValue(new Error('fixture-webhook-secret'))
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  await expect(runDailyCron(env, now, deps)).resolves.toBeUndefined()
  expect(deps.reevaluateBadges).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(errors.mock.calls)).toContain('notification failed unexpectedly')
  expect(JSON.stringify(errors.mock.calls)).not.toContain('fixture-webhook-secret')
})

test('a failed starting post does not stop the ending post or badge evaluation', async () => {
  const deps = dependencies()
  deps.twitter.tweetDailySummary.mockRejectedValue(new Error('fixture-secret'))
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  await runDailyCron(env, now, deps)
  expect(deps.twitter.tweetEndingTodaySummary).toHaveBeenCalledWith(events)
  expect(deps.reevaluateBadges).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(errors.mock.calls)).not.toContain('fixture-secret')
})

test('badge evaluation starts while the authentication check is still pending', async () => {
  const deps = dependencies()
  let finishCheck = () => {}
  const pending = new Promise<void>((resolve) => {
    finishCheck = resolve
  })
  deps.twitter.checkAuthenticatedSession.mockImplementation(() => pending)
  const running = runDailyCron(env, now, deps)
  expect(deps.reevaluateBadges).toHaveBeenCalledTimes(1)
  expect(deps.startingToday).not.toHaveBeenCalled()
  finishCheck()
  await running
  expect(deps.twitter.tweetDailySummary).toHaveBeenCalledWith(events)
})

test('badge failure does not stop health checking and posting', async () => {
  const deps = dependencies()
  deps.reevaluateBadges.mockRejectedValue(new Error('fixture-secret'))
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  await runDailyCron(env, now, deps)
  expect(deps.twitter.tweetDailySummary).toHaveBeenCalledWith(events)
  expect(deps.twitter.tweetEndingTodaySummary).toHaveBeenCalledWith(events)
  expect(JSON.stringify(errors.mock.calls)).not.toContain('fixture-secret')
})
