import { afterEach, expect, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Twitter } from '../../workers/app/src/utils/twitter'

const home = readFileSync(`${import.meta.dir}/fixtures/x-home.html`, 'utf8')
const signer = readFileSync(`${import.meta.dir}/fixtures/ondemand.s.js`, 'utf8')
const originalCaches = globalThis.caches
afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore()
  globalThis.caches = originalCaches
})
test('caches one validated transaction snapshot for 30 minutes and reuses it', async () => {
  const entries = new Map<string, Response>()
  const puts: Response[] = []
  globalThis.caches = {
    open: async () => ({
      match: async (key: string) => entries.get(key)?.clone(),
      put: async (key: string, response: Response) => {
        entries.set(key, response.clone())
        puts.push(response)
      }
    })
  } as unknown as CacheStorage
  let acquisitions = 0
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input)
        if (url.startsWith('https://x.com/i/api/')) return new Response('unavailable', { status: 503 })
        acquisitions++
        return new Response(url.startsWith('https://abs.twimg.com/') ? signer : home)
      },
      { preconnect: () => {} }
    )
  )
  const twitter = new Twitter({ TWITTER_AUTH_TOKEN: 'test', TWITTER_CSRF_TOKEN: 'test' } as never)
  await expect(twitter.getOwnAccount()).rejects.toThrow('503')
  await expect(twitter.getOwnAccount()).rejects.toThrow('503')
  expect(acquisitions).toBe(2)
  expect(puts).toHaveLength(1)
  expect(puts[0].headers.get('cache-control')).toBe('max-age=1800')
  expect(await puts[0].json<{ homePageHtml: string; ondemandFileText: string }>()).toEqual({
    homePageHtml: home,
    ondemandFileText: signer
  })
})
test('does not cache invalid transaction material', async () => {
  let puts = 0
  globalThis.caches = {
    open: async () => ({
      match: async () => undefined,
      put: async () => {
        puts++
      }
    })
  } as unknown as CacheStorage
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) =>
        new Response(String(input).startsWith('https://abs.twimg.com/') ? 'unknown signer' : home),
      { preconnect: () => {} }
    )
  )
  const twitter = new Twitter({ TWITTER_AUTH_TOKEN: 'test', TWITTER_CSRF_TOKEN: 'test' } as never)
  await expect(twitter.getOwnAccount()).rejects.toThrow('KEY_BYTE')
  expect(puts).toBe(0)
})
test('refetches malformed cached snapshots before issuing the account request', async () => {
  const keys: string[] = []
  globalThis.caches = {
    open: async () => ({
      match: async () => new Response('{broken'),
      put: async (key: string) => {
        keys.push(key)
      }
    })
  } as unknown as CacheStorage
  const urls: string[] = []
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input)
        urls.push(url)
        if (url.startsWith('https://x.com/i/api/')) return new Response('', { status: 503 })
        return new Response(url.startsWith('https://abs.twimg.com/') ? signer : home)
      },
      { preconnect: () => {} }
    )
  )
  await expect(
    new Twitter({ TWITTER_AUTH_TOKEN: 'test', TWITTER_CSRF_TOKEN: 'test' } as never).getOwnAccount()
  ).rejects.toThrow('503')
  expect(urls).toHaveLength(3)
  expect(keys).toEqual(['https://x-transaction-cache.local/inputs-v2'])
})
