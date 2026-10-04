import { expect, mock, spyOn, test } from 'bun:test'
import { TwitterHealthError } from '@biccame/shared/x/health'
import { runBadgeCron } from '../../workers/app/src/services/badge-cron'
import { runBotDaily } from '../../workers/bot/src/posting'

const scheduledAt = '2026-10-03T00:00:00Z'
const targets = {
  ok: true as const,
  targets: {
    scheduledAt,
    starting: { eventUUIDs: [], texts: ['synthetic starting event'] },
    ending: { eventUUIDs: [], texts: ['synthetic ending event'] }
  }
}
const dependencies = () => ({
  transport: {
    checkAuthenticatedSession: mock(async () => {}),
    tweet: mock(async (_text: string, _opts?: { replyToTweetId?: string }) => '12345'),
    getOwnAccount: mock(async () => ({}))
  },
  app: { dailyTargets: mock(async () => targets) },
  notifyHealthFailure: mock(async () => {})
})

test('bot daily checks auth before targets and preserves the ISO scheduled date', async () => {
  const deps = dependencies()
  const order: string[] = []
  deps.transport.checkAuthenticatedSession.mockImplementation(async () => {
    order.push('health')
  })
  deps.app.dailyTargets.mockImplementation(async () => {
    order.push('targets')
    return targets
  })
  await runBotDaily({ X_POSTING_ENABLED: 'true' }, scheduledAt, deps.transport, deps)
  expect(order).toEqual(['health', 'targets'])
  expect(deps.app.dailyTargets).toHaveBeenCalledWith({ scheduledAt })
  expect(deps.transport.tweet).toHaveBeenCalledTimes(2)
})

for (const kind of [
  'authentication',
  'account_mismatch',
  'missing_credentials',
  'signature',
  'rate_limit',
  'network'
] as const) {
  test(`bot health ${kind} skips posting while app badge evaluation remains independent`, async () => {
    const deps = dependencies()
    const failure = new TwitterHealthError(kind)
    deps.transport.checkAuthenticatedSession.mockRejectedValue(failure)
    const badges = mock(async () => {})
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    try {
      await Promise.all([
        runBotDaily({ X_POSTING_ENABLED: 'true' }, scheduledAt, deps.transport, deps),
        runBadgeCron({} as never, new Date(scheduledAt), badges)
      ])
      expect(deps.notifyHealthFailure).toHaveBeenCalledWith(failure, scheduledAt)
      expect(deps.app.dailyTargets).not.toHaveBeenCalled()
      expect(deps.transport.tweet).not.toHaveBeenCalled()
      expect(badges).toHaveBeenCalledTimes(1)
    } finally {
      errors.mockRestore()
    }
  })
}

test('badge evaluation starts independently while bot authentication is pending', async () => {
  const deps = dependencies()
  let finish = () => {}
  deps.transport.checkAuthenticatedSession.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const badges = mock(async () => {})
  const daily = runBotDaily({ X_POSTING_ENABLED: 'true' }, scheduledAt, deps.transport, deps)
  await runBadgeCron({} as never, new Date(scheduledAt), badges)
  expect(badges).toHaveBeenCalledTimes(1)
  expect(deps.app.dailyTargets).not.toHaveBeenCalled()
  finish()
  await daily
})
