import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { TwitterHealthError } from '@biccame/shared/x/health'
import { TwitterTransport } from '@biccame/shared/x/transport'

const homePageHtml = readFileSync(`${import.meta.dir}/fixtures/x-home.html`, 'utf8')
const ondemandFileText = readFileSync(`${import.meta.dir}/fixtures/ondemand.s.js`, 'utf8')
const CACHE_KEY = 'https://x-transaction-cache.local/inputs-v2'
const SETTINGS_URL = 'https://api.x.com/1.1/account/settings.json'
const credentials = { TWITTER_AUTH_TOKEN: 'fixture-auth', TWITTER_CSRF_TOKEN: 'fixture-csrf' }
const originalCaches = globalThis.caches
const tweetCreated = { data: { create_tweet: { tweet_results: { result: { rest_id: '789' } } } } }

const installCaches = (value: unknown) =>
  Object.defineProperty(globalThis, 'caches', { value, configurable: true, writable: true })

/** 削除を実際に反映する簡易キャッシュ。初期状態では検証済みの署名材料が入っている。 */
const createCache = (options: { deleteFails?: boolean } = {}) => {
  const entries = new Map<string, string>([[CACHE_KEY, JSON.stringify({ homePageHtml, ondemandFileText })]])
  const deletes: string[] = []
  const cache = {
    match: async (key: string) => (entries.has(key) ? new Response(entries.get(key)) : undefined),
    put: async (key: string, response: Response) => {
      entries.set(key, await response.text())
    },
    delete: async (key: string) => {
      deletes.push(key)
      if (options.deleteFails) throw new Error('synthetic delete failure')
      return entries.delete(key)
    }
  }
  installCaches({ open: async () => cache })
  return { entries, deletes }
}

/** X 宛て以外(ホームと署名モジュール)は固定の応答を返し、X の API への送信だけを記録する。 */
const routeFetch = (
  api: (url: string, count: number) => Response | Promise<Response>,
  options = { homeFails: false }
) => {
  const apiCalls: string[] = []
  const acquisitions: string[] = []
  const mock = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input)
        if (url === 'https://x.com/' || url.startsWith('https://abs.twimg.com/')) {
          acquisitions.push(url)
          if (options.homeFails) throw new Error('synthetic acquisition failure')
          return new Response(url.startsWith('https://abs.twimg.com/') ? ondemandFileText : homePageHtml)
        }
        apiCalls.push(url)
        return api(url, apiCalls.length)
      },
      { preconnect: () => {} }
    )
  )
  return { mock, apiCalls, acquisitions }
}

const failureKind = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run()
  } catch (error) {
    return error instanceof TwitterHealthError ? error.kind : error
  }
  return 'resolved'
}

beforeEach(() => {
  spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore()
  spyOn(console, 'warn').mockRestore()
  installCaches(originalCaches)
})

for (const status of [403, 404]) {
  test(`checkAuthenticatedSession drops the cache on ${status} and succeeds on the single resend`, async () => {
    const cache = createCache()
    const { apiCalls, acquisitions } = routeFetch((_url, count) =>
      count === 1 ? new Response('', { status }) : Response.json({ screen_name: '_biccame_musume' })
    )
    await new TwitterTransport(credentials).checkAuthenticatedSession()
    expect(cache.deletes).toEqual([CACHE_KEY])
    expect(apiCalls).toEqual([SETTINGS_URL, SETTINGS_URL])
    // 破棄したので、再送の前に x.com とモジュールを取り直している
    expect(acquisitions).toHaveLength(2)
    expect(cache.entries.has(CACHE_KEY)).toBe(true)
  })
}

test('checkAuthenticatedSession resends only once and keeps the original classification', async () => {
  createCache()
  const { apiCalls } = routeFetch(() => new Response('sensitive upstream detail', { status: 403 }))
  expect(await failureKind(() => new TwitterTransport(credentials).checkAuthenticatedSession())).toBe('authorization')
  expect(apiCalls).toHaveLength(2)
})

test('checkAuthenticatedSession keeps the original 404 classification after the resend', async () => {
  createCache()
  const { apiCalls } = routeFetch(() => Response.json({}, { status: 404 }))
  expect(await failureKind(() => new TwitterTransport(credentials).checkAuthenticatedSession())).toBe(
    'unexpected_response'
  )
  expect(apiCalls).toHaveLength(2)
})

test('a failed re-acquisition classifies by the first response, not as a signature failure', async () => {
  const cache = createCache()
  const { apiCalls } = routeFetch(() => new Response('sensitive upstream detail', { status: 403 }), { homeFails: true })
  expect(await failureKind(() => new TwitterTransport(credentials).checkAuthenticatedSession())).toBe('authorization')
  expect(cache.deletes).toEqual([CACHE_KEY])
  expect(apiCalls).toHaveLength(1)
})

test('statuses other than 403 and 404 neither drop the cache nor resend', async () => {
  const cache = createCache()
  const { apiCalls } = routeFetch(() => Response.json({}, { status: 429 }))
  expect(await failureKind(() => new TwitterTransport(credentials).checkAuthenticatedSession())).toBe('rate_limit')
  expect(cache.deletes).toEqual([])
  expect(apiCalls).toHaveLength(1)
})

for (const status of [403, 404]) {
  test(`tweet() drops the cache on ${status} but never resends CreateTweet`, async () => {
    const cache = createCache()
    const { apiCalls } = routeFetch(() => new Response('', { status }))
    await expect(new TwitterTransport(credentials).tweet('synthetic')).rejects.toMatchObject({
      kind: 'rejected',
      status
    })
    expect(apiCalls).toHaveLength(1)
    expect(apiCalls[0]).toContain('/CreateTweet')
    expect(cache.deletes).toEqual([CACHE_KEY])
  })
}

test('the quote-403 retry is unchanged and does not drop the cache when it succeeds', async () => {
  const cache = createCache()
  const { apiCalls } = routeFetch((_url, count) =>
    count === 1 ? new Response('', { status: 403 }) : Response.json(tweetCreated)
  )
  expect(await new TwitterTransport(credentials).tweet('synthetic', { quoteTweetId: '123' })).toBe('789')
  expect(apiCalls).toHaveLength(2)
  expect(cache.deletes).toEqual([])
})

test('tweet() does not drop the cache on 429 or 500', async () => {
  const cache = createCache()
  const { apiCalls } = routeFetch((_url, count) => new Response('', { status: count === 1 ? 429 : 500 }))
  await expect(new TwitterTransport(credentials).tweet('synthetic')).rejects.toMatchObject({ kind: 'rate_limit' })
  await expect(new TwitterTransport(credentials).tweet('synthetic')).rejects.toMatchObject({ kind: 'delivery_unknown' })
  expect(apiCalls).toHaveLength(2)
  expect(cache.deletes).toEqual([])
})

test('uploadImage() drops the cache on 403 and stops without resending', async () => {
  const cache = createCache()
  const { apiCalls } = routeFetch(() => new Response('', { status: 403 }))
  await expect(new TwitterTransport(credentials).uploadImage(new Uint8Array([1]))).rejects.toMatchObject({
    kind: 'rejected',
    status: 403
  })
  expect(apiCalls).toHaveLength(1)
  expect(cache.deletes).toEqual([CACHE_KEY])
})

test('getOwnAccount() drops the cache on 404 without resending', async () => {
  const cache = createCache()
  const { apiCalls } = routeFetch(() => new Response('', { status: 404 }))
  await expect(new TwitterTransport(credentials).getOwnAccount()).rejects.toMatchObject({
    kind: 'rejected',
    status: 404
  })
  expect(apiCalls).toHaveLength(1)
  expect(cache.deletes).toEqual([CACHE_KEY])
})

test('a failing cache delete cannot change the transport error classification', async () => {
  const cache = createCache({ deleteFails: true })
  routeFetch(() => new Response('', { status: 404 }))
  await expect(new TwitterTransport(credentials).tweet('synthetic')).rejects.toMatchObject({
    kind: 'rejected',
    status: 404
  })
  expect(cache.deletes).toEqual([CACHE_KEY])
})

test('a Cache API that fails while dropping the entry cannot change the transport error classification', async () => {
  const opens: number[] = []
  // 署名材料の取得(1回目)は成功させ、403/404 のあとの破棄(2回目)だけ Cache API 自体を失敗させる。
  installCaches({
    open: async () => {
      opens.push(opens.length + 1)
      if (opens.length > 1) throw new Error('synthetic open failure')
      return { match: async () => new Response(JSON.stringify({ homePageHtml, ondemandFileText })) }
    }
  })
  const { apiCalls } = routeFetch(() => new Response('', { status: 404 }))
  await expect(new TwitterTransport(credentials).tweet('synthetic')).rejects.toMatchObject({
    kind: 'rejected',
    status: 404
  })
  expect(apiCalls).toHaveLength(1)
  expect(opens).toEqual([1, 2])
})
