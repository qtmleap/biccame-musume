import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ClientTransaction as AppTransaction } from '../../../../workers/app/src/lib/x-transaction/transaction'
import { TwitterHealthError as AppHealthError } from '../../../../workers/app/src/utils/twitter-health'
import { TwitterHealthError } from './health'
import { ClientTransaction } from './transaction'
import { buildCreateTweetBody, TwitterTransport, TwitterTransportError } from './transport'

const homePageHtml = readFileSync(
  new URL('../../../../__tests__/x-transaction/fixtures/x-home.html', import.meta.url),
  'utf8'
)
const ondemandFileText = readFileSync(
  new URL('../../../../__tests__/x-transaction/fixtures/ondemand.s.js', import.meta.url),
  'utf8'
)
const originalCaches = globalThis.caches
const credentials = { TWITTER_AUTH_TOKEN: 'synthetic-auth', TWITTER_CSRF_TOKEN: 'synthetic-csrf' }
const sensitive = 'synthetic-auth synthetic-csrf private-upstream-detail'

beforeEach(() => {
  globalThis.caches = {
    open: async () => ({
      match: async () => Response.json({ homePageHtml, ondemandFileText }),
      put: async () => {}
    })
  } as unknown as CacheStorage
})
afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore()
  globalThis.caches = originalCaches
})

const mockFetch = (handler: (...args: Parameters<typeof fetch>) => Promise<Response>) =>
  spyOn(globalThis, 'fetch').mockImplementation(Object.assign(handler, { preconnect: () => {} }))

test('compatibility reexports preserve transaction and health error identities', () => {
  expect(AppTransaction).toBe(ClientTransaction)
  expect(AppHealthError).toBe(TwitterHealthError)
})

test('shared body builder preserves quoted/reply tweet contract', () => {
  const body = JSON.parse(buildCreateTweetBody('synthetic post', { quoteTweetId: '123', replyToTweetId: '456' }))
  expect(body.queryId).toBe('oB-5XsHNAbjvARJEc8CZFw')
  expect(body.variables).toEqual({
    tweet_text: 'synthetic post',
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: [],
    attachment_url: 'https://x.com/i/status/123',
    reply: { in_reply_to_tweet_id: '456', exclude_reply_user_ids: [] }
  })
  expect(body.features.responsive_web_graphql_timeline_navigation_enabled).toBe(true)
})

test('POST network ambiguity is safely classified and never retried', async () => {
  const fetch = mockFetch(async () => {
    throw new Error(sensitive)
  })
  await expect(new TwitterTransport(credentials).tweet('synthetic')).rejects.toMatchObject({ kind: 'delivery_unknown' })
  expect(fetch).toHaveBeenCalledTimes(1)
})

for (const [status, kind] of [
  [429, 'rate_limit'],
  [401, 'rejected'],
  [500, 'delivery_unknown']
] as const) {
  test(`POST ${status} discards response details and does not retry`, async () => {
    const fetch = mockFetch(async () => new Response(sensitive, { status }))
    try {
      await new TwitterTransport(credentials).tweet('synthetic')
      throw new Error('Expected transport failure')
    } catch (error) {
      expect(error).toBeInstanceOf(TwitterTransportError)
      if (!(error instanceof TwitterTransportError)) throw error
      expect(error.kind).toBe(kind)
      expect(error.status).toBe(status)
      expect(error.message).not.toContain(sensitive)
    }
    expect(fetch).toHaveBeenCalledTimes(1)
  })
}

test('only explicit quote 403 retries once without the quote and preserves reply', async () => {
  const bodies: Record<string, unknown>[] = []
  const fetch = mockFetch(async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    return bodies.length === 1
      ? new Response(sensitive, { status: 403 })
      : Response.json({ data: { create_tweet: { tweet_results: { result: { rest_id: '789' } } } } })
  })
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    expect(
      await new TwitterTransport(credentials).tweet('synthetic', { quoteTweetId: '123', replyToTweetId: '456' })
    ).toBe('789')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(bodies[0]).toHaveProperty('variables.attachment_url', 'https://x.com/i/status/123')
    expect(bodies[1]).not.toHaveProperty('variables.attachment_url')
    expect(bodies[1]).toHaveProperty('variables.reply.in_reply_to_tweet_id', '456')
    expect(warning.mock.calls).toEqual([
      ['[Twitter] Quote tweet not allowed, retrying without quote:', { status: 403 }]
    ])
  } finally {
    warning.mockRestore()
  }
})

test.each([sensitive, '{}', JSON.stringify({ data: { private: sensitive } })])(
  'successful HTTP without confirmed tweet ID is delivery_unknown, not a retry trigger',
  async (body) => {
    const fetch = mockFetch(async () => new Response(body))
    await expect(new TwitterTransport(credentials).tweet('synthetic')).rejects.toMatchObject({
      kind: 'delivery_unknown'
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  }
)

test('missing credentials stop before signature acquisition or POST', async () => {
  const fetch = mockFetch(async () => {
    throw new Error('Unexpected request')
  })
  await expect(
    new TwitterTransport({ ...credentials, TWITTER_AUTH_TOKEN: '' }).tweet('synthetic')
  ).rejects.toMatchObject({ kind: 'missing_credentials' })
  expect(fetch).not.toHaveBeenCalled()
})

test('public profile failure does not expose API body or internal network errors', async () => {
  const fetch = mockFetch(async () => new Response(sensitive, { status: 503 }))
  await expect(new TwitterTransport(credentials).getOwnAccount()).rejects.toMatchObject({
    kind: 'rejected',
    status: 503
  })
  fetch.mockImplementation(
    Object.assign(
      async () => {
        throw new Error(sensitive)
      },
      { preconnect: () => {} }
    )
  )
  await expect(new TwitterTransport(credentials).getOwnAccount()).rejects.toMatchObject({ kind: 'network' })
})
