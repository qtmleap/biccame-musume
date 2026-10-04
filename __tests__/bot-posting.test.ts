import { expect, mock, spyOn, test } from 'bun:test'
import type { Announcement, DailyTargetsResult } from '@biccame/shared/bot'
import { TwitterTransportError } from '@biccame/shared/x/transport'
import { type PostingTransport, postAnnouncement, readBotAccount, runBotDaily } from '../workers/bot/src/posting'

const request: Announcement = {
  eventUUID: '550e8400-e29b-41d4-a716-446655440000',
  revision: '2026-10-03T00:00:00Z',
  purpose: 'created',
  text: '架空のイベント告知',
  quoteTweetId: '12345'
}
const account = {
  restId: '123',
  screenName: '_biccame_musume',
  name: '架空のプロフィール',
  followersCount: 0,
  friendsCount: 0,
  statusesCount: 0,
  favouritesCount: 0,
  listedCount: 0,
  mediaCount: 0,
  createdAt: 'Thu Oct 01 00:00:00 +0000 2026',
  profileImageUrl: '',
  profileBannerUrl: null,
  description: ''
}
const makeTransport = () =>
  ({
    checkAuthenticatedSession: mock(async () => {}),
    tweet: mock(async (_text: string, _options?: { quoteTweetId?: string; replyToTweetId?: string }) => '456'),
    getOwnAccount: mock(async () => account)
  }) satisfies PostingTransport
const scheduledAt = '2026-10-03T00:00:00Z'
const targets: DailyTargetsResult = {
  ok: true,
  targets: {
    scheduledAt,
    starting: { eventUUIDs: [request.eventUUID], texts: ['架空の開始告知1', '架空の開始告知2'] },
    ending: { eventUUIDs: [request.eventUUID], texts: ['架空の終了告知'] }
  }
}

test('disabled posting and invalid contracts cannot invoke authentication or posting', async () => {
  const transport = makeTransport()
  expect(await postAnnouncement({}, request, transport)).toEqual({ status: 'disabled' })
  expect(
    await postAnnouncement({ X_POSTING_ENABLED: 'true' }, { ...request, revision: new Date() }, transport)
  ).toEqual({ status: 'failed', kind: 'configuration' })
  expect(transport.checkAuthenticatedSession).not.toHaveBeenCalled()
  expect(transport.tweet).not.toHaveBeenCalled()
})

test('announcement verifies posting identity and sends the unchanged text/quote once', async () => {
  const transport = makeTransport()
  const order: string[] = []
  transport.checkAuthenticatedSession.mockImplementation(async () => {
    order.push('health')
  })
  transport.tweet.mockImplementation(async () => {
    order.push('post')
    return '456'
  })
  expect(await postAnnouncement({ X_POSTING_ENABLED: 'true' }, request, transport)).toEqual({
    status: 'sent',
    tweetId: '456'
  })
  expect(order).toEqual(['health', 'post'])
  expect(transport.tweet).toHaveBeenCalledWith(request.text, { quoteTweetId: request.quoteTweetId })
})

test('wrong/unverified posting identity never posts', async () => {
  const transport = makeTransport()
  transport.checkAuthenticatedSession.mockRejectedValue(
    Object.assign(new Error('secret-like-details'), { kind: 'account_mismatch' })
  )
  expect(await postAnnouncement({ X_POSTING_ENABLED: 'true' }, request, transport)).toEqual({
    status: 'failed',
    kind: 'account_mismatch'
  })
  expect(transport.tweet).not.toHaveBeenCalled()
})

test.each([
  { error: new TwitterTransportError('delivery_unknown'), result: { status: 'unknown', kind: 'delivery_unknown' } },
  { error: new TwitterTransportError('missing_credentials'), result: { status: 'failed', kind: 'configuration' } },
  { error: { kind: 'rate_limit', delivery: 'failed' }, result: { status: 'failed', kind: 'rate_limit' } },
  { error: { kind: 'signature', delivery: 'failed' }, result: { status: 'failed', kind: 'signature' } },
  { error: { kind: 'network', delivery: 'unknown' }, result: { status: 'unknown', kind: 'network' } },
  { error: new Error('private-token https://private.invalid'), result: { status: 'unknown', kind: 'network' } }
])('failure classification does not leak errors or retry a post', async ({ error, result }) => {
  const transport = makeTransport()
  transport.tweet.mockRejectedValue(error)
  expect(await postAnnouncement({ X_POSTING_ENABLED: 'true' }, request, transport)).toEqual(result)
  expect(transport.tweet).toHaveBeenCalledTimes(1)
})

test('accepted-but-malformed tweet response is unknown, not an automatic resend', async () => {
  const transport = makeTransport()
  transport.tweet.mockResolvedValue('invalid-id')
  expect(await postAnnouncement({ X_POSTING_ENABLED: 'true' }, request, transport)).toEqual({
    status: 'unknown',
    kind: 'unexpected_response'
  })
  expect(transport.tweet).toHaveBeenCalledTimes(1)
})

test('profile lookup stays distinct from authenticated-session verification', async () => {
  const transport = makeTransport()
  expect(await readBotAccount({}, transport)).toEqual({ ok: false, kind: 'disabled' })
  expect(transport.getOwnAccount).not.toHaveBeenCalled()
  expect(await readBotAccount({ X_ACCOUNT_READ_ENABLED: 'true' }, transport)).toEqual({ ok: true, account })
  expect(transport.checkAuthenticatedSession).not.toHaveBeenCalled()
  transport.getOwnAccount.mockRejectedValueOnce(new Error('private-profile-response'))
  expect(await readBotAccount({ X_ACCOUNT_READ_ENABLED: 'true' }, transport)).toEqual({
    ok: false,
    kind: 'unexpected_response'
  })
})

test('daily checks auth before reading targets and preserves two separate reply threads', async () => {
  const transport = makeTransport()
  let index = 0
  transport.tweet.mockImplementation(async () => String(++index))
  const app = { dailyTargets: mock(async () => targets) }
  const notify = mock(async () => {})
  await runBotDaily({ X_POSTING_ENABLED: 'true' }, scheduledAt, transport, { app, notifyHealthFailure: notify })
  expect(app.dailyTargets).toHaveBeenCalledWith({ scheduledAt })
  expect(transport.tweet).toHaveBeenCalledWith('架空の開始告知1', { replyToTweetId: undefined })
  expect(transport.tweet).toHaveBeenCalledWith('架空の終了告知', { replyToTweetId: undefined })
  expect(transport.tweet).toHaveBeenCalledWith('架空の開始告知2', { replyToTweetId: '1' })
  expect(notify).not.toHaveBeenCalled()
})

test('daily authentication failure notifies safely without target reads or posts', async () => {
  const transport = makeTransport()
  const app = { dailyTargets: mock(async () => targets) }
  const notify = mock(async () => {})
  const error = new Error('fixture-auth-error')
  transport.checkAuthenticatedSession.mockRejectedValue(error)
  const log = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await runBotDaily({ X_POSTING_ENABLED: 'true' }, scheduledAt, transport, { app, notifyHealthFailure: notify })
    expect(notify).toHaveBeenCalledWith(error, scheduledAt)
    expect(app.dailyTargets).not.toHaveBeenCalled()
    expect(transport.tweet).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})

test('daily authenticates even when target arrays are empty', async () => {
  const transport = makeTransport()
  await runBotDaily({ X_POSTING_ENABLED: 'true' }, scheduledAt, transport, {
    app: {
      dailyTargets: async () => ({
        ok: true,
        targets: { scheduledAt, starting: { eventUUIDs: [], texts: [] }, ending: { eventUUIDs: [], texts: [] } }
      })
    },
    notifyHealthFailure: async () => {}
  })
  expect(transport.checkAuthenticatedSession).toHaveBeenCalledTimes(1)
  expect(transport.tweet).not.toHaveBeenCalled()
})

test('daily refuses stale or malformed RPC targets without leaking their content', async () => {
  const transport = makeTransport()
  const log = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await runBotDaily({ X_POSTING_ENABLED: 'true' }, scheduledAt, transport, {
      app: {
        dailyTargets: async () => ({ ok: true, targets: { ...targets.targets, scheduledAt: '2026-10-02T00:00:00Z' } })
      },
      notifyHealthFailure: async () => {}
    })
    expect(transport.tweet).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})

test('ambiguous starting-thread failure stops only that thread and never resends it', async () => {
  const transport = makeTransport()
  transport.tweet.mockImplementation(async (text) => {
    if (text === '架空の開始告知1') throw { kind: 'network', delivery: 'unknown' }
    return '456'
  })
  const log = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await runBotDaily({ X_POSTING_ENABLED: 'true' }, scheduledAt, transport, {
      app: { dailyTargets: async () => targets },
      notifyHealthFailure: async () => {}
    })
    expect(transport.tweet).toHaveBeenCalledTimes(2)
    expect(transport.tweet.mock.calls.map(([text]) => text).sort()).toEqual(
      ['架空の開始告知1', '架空の終了告知'].sort()
    )
    expect(log).toHaveBeenCalledWith('bot daily: thread stopped', { purpose: 'starting', status: 'unknown' })
  } finally {
    log.mockRestore()
  }
})
