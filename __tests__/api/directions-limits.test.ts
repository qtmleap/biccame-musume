import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import directions from '@/api/direction'
import { RouteResponseSchema } from '@/schemas/route.dto'
import type { Bindings, Variables } from '@/types/bindings'

const leg = { from: '店舗A', to: '店舗B', fromStation: '東京', toStation: '大阪' }
const answer = {
  legs: [
    {
      ...leg,
      routes: [{ operator: 'JR', line: '東海道', from: '東京', to: '大阪', duration: 150 }],
      duration: 150,
      transfers: 0
    }
  ]
}
const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
let now = 0
let entries: Map<string, { response: Response; expires: number }>
let aiCalls = 0
let quotaKeys: string[]
let allowed = true
let aiResult: unknown
let aiThrows = false
let cacheThrows = false
const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()
app.route('/api/directions', directions)
// Match the production error serializer: an empty HTTPException.message is a broken response.
app.onError((error, c) => c.json({ message: error.message }, error instanceof HTTPException ? error.status : 500))
const env = {
  ENVIRONMENT: 'prod',
  AI: {
    run: async () => {
      aiCalls++
      if (aiThrows) throw new Error('stub AI failure')
      return { response: aiResult }
    }
  },
  DIRECTIONS_RATE_LIMITER: {
    limit: async ({ key }: { key: string }) => {
      quotaKeys.push(key)
      return { success: allowed }
    }
  }
} as unknown as Bindings
const request = (body: unknown = { legs: [leg] }, extraHeaders: Record<string, string> = {}, ip = '203.0.113.4') =>
  app.request(
    '/api/directions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...extraHeaders },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    },
    env
  )

beforeEach(() => {
  now = 0
  entries = new Map()
  aiCalls = 0
  quotaKeys = []
  allowed = true
  aiResult = answer
  aiThrows = false
  cacheThrows = false
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      open: async () => ({
        match: async (key: Request) => {
          if (cacheThrows) throw new Error('stub cache failure')
          const item = entries.get(key.url)
          return item && item.expires > now ? item.response.clone() : undefined
        },
        put: async (key: Request, response: Response) => {
          if (cacheThrows) throw new Error('stub cache failure')
          const ttl = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1])
          entries.set(key.url, { response: response.clone(), expires: now + ttl * 1000 })
        }
      })
    }
  })
})
afterEach(() => {
  if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches)
  else Reflect.deleteProperty(globalThis, 'caches')
})

describe('directions resource limits', () => {
  for (const field of ['from', 'to', 'fromStation', 'toStation']) {
    test(`oversized_input_never_calls_ai: ${field} 101 characters`, async () => {
      expect((await request({ legs: [{ ...leg, [field]: '駅'.repeat(101) }] })).status).toBe(400)
      expect(aiCalls).toBe(0)
    })
  }
  for (const headers of [{} as Record<string, string>, { 'Content-Length': '1' }]) {
    test(`oversized_input_never_calls_ai: actual UTF-8 bytes with ${JSON.stringify(headers)}`, async () => {
      const body = JSON.stringify({ legs: [leg], padding: '駅'.repeat(2800) })
      const response = await request(body, headers)
      expect(response.status).toBe(413)
      expect(z.object({ message: z.string().nonempty() }).parse(await response.json()).message).toMatch(
        /[ぁ-んァ-ヶ一-龠]/
      )
      expect(aiCalls).toBe(0)
    })
  }
  test('8192 bytes accepted and 8193 bytes rejected before parsing', async () => {
    const body = JSON.stringify({ legs: [leg] })
    const bytes = new TextEncoder().encode(body).byteLength
    expect((await request(body + ' '.repeat(8192 - bytes))).status).toBe(200)
    expect((await request(body + ' '.repeat(8193 - bytes))).status).toBe(413)
    expect(aiCalls).toBe(1)
  })
  test('retains five-leg maximum and rejects malformed input', async () => {
    expect((await request({ legs: Array(6).fill(leg) })).status).toBe(400)
    expect((await request('{')).status).toBe(400)
    expect(aiCalls).toBe(0)
  })
  test('rate_limit_denial_never_calls_ai', async () => {
    allowed = false
    const response = await request()
    expect(response.status).toBe(429)
    expect(z.object({ message: z.string().nonempty() }).parse(await response.json()).message).toMatch(
      /[ぁ-んァ-ヶ一-龠]/
    )
    expect(aiCalls).toBe(0)
    expect(quotaKeys).toEqual(['directions:203.0.113.4'])
  })
  test('untrusted or missing IP is rejected before AI', async () => {
    for (const ip of ['', 'not-an-ip', '203.0.113.4, 198.51.100.1']) {
      const response = await request(undefined, { 'X-Real-IP': '198.51.100.1' }, ip)
      expect(response.status).toBe(403)
      expect(z.object({ message: z.string().nonempty() }).parse(await response.json()).message).toMatch(
        /[ぁ-んァ-ヶ一-龠]/
      )
    }
    expect(aiCalls).toBe(0)
    expect(quotaKeys).toEqual([])
  })
  test('IPv6 uses checked address for quota', async () => {
    expect((await request(undefined, {}, '2001:db8::1')).status).toBe(200)
    expect(quotaKeys).toEqual(['directions:2001:db8::1'])
  })
  test('identical_route_reuses_cache and expires after ten minutes', async () => {
    expect(RouteResponseSchema.parse(await (await request()).json())).toEqual({
      status: 'estimated',
      ...answer
    })
    expect(RouteResponseSchema.parse(await (await request()).json())).toEqual({
      status: 'estimated',
      ...answer
    })
    expect(aiCalls).toBe(1)
    now = 600000
    await request()
    expect(aiCalls).toBe(2)
  })
  test('legacy A04 cache payload is regenerated under the status contract', async () => {
    await request()
    const key = [...entries.keys()][0]
    entries.set(key, { response: new Response(JSON.stringify(answer)), expires: 600000 })
    expect(RouteResponseSchema.parse(await (await request()).json())).toEqual({
      status: 'estimated',
      ...answer
    })
    expect(aiCalls).toBe(2)
  })
  test('normalizes outer whitespace and Unicode without leaking caller labels', async () => {
    const padded = { ...leg, from: ' 店舗A ', fromStation: ' 東京 ' }
    await request({ legs: [padded] })
    expect(RouteResponseSchema.parse(await (await request()).json())).toEqual({
      status: 'estimated',
      ...answer
    })
    expect(aiCalls).toBe(1)
    aiResult = { legs: [{ ...answer.legs[0], from: 'ガ' }] }
    await request({ legs: [{ ...leg, from: 'ガ' }] })
    await request({ legs: [{ ...leg, from: 'ガ' }] })
    expect(aiCalls).toBe(2)
  })
  test('cache preserves all endpoints, direction and leg order', async () => {
    await request()
    for (const field of ['from', 'to', 'fromStation', 'toStation'])
      await request({ legs: [{ ...leg, [field]: '別名' }] })
    const second = { ...leg, from: '店舗C' }
    aiResult = { legs: [answer.legs[0], { ...answer.legs[0], ...second }] }
    await request({ legs: [leg, second] })
    await request({ legs: [leg, second] })
    aiResult = { legs: [{ ...answer.legs[0], ...second }, answer.legs[0]] }
    await request({ legs: [second, leg] })
    await request({ legs: [second, leg] })
    expect(aiCalls).toBe(7)
    expect(entries.size).toBe(3)
  })
  test('cache hit still consumes quota and cannot bypass denial', async () => {
    await request()
    allowed = false
    expect((await request()).status).toBe(429)
    expect(aiCalls).toBe(1)
    expect(quotaKeys).toHaveLength(2)
  })
  for (const mode of ['invalid', 'throw', 'degraded']) {
    test(`degraded ${mode} results are not cached`, async () => {
      aiResult = mode === 'invalid' ? { invalid: true } : { ...answer, degraded: true }
      aiThrows = mode === 'throw'
      expect(RouteResponseSchema.parse(await (await request()).json()).status).toBe('unavailable')
      expect(RouteResponseSchema.parse(await (await request()).json()).status).toBe('unavailable')
      expect(aiCalls).toBe(2)
      expect(entries.size).toBe(0)
    })
  }
  test('missing or failing Cache API does not prevent success', async () => {
    cacheThrows = true
    expect((await request()).status).toBe(200)
    Reflect.deleteProperty(globalThis, 'caches')
    expect((await request()).status).toBe(200)
    expect(aiCalls).toBe(2)
  })
})

test('OpenAPI documents status union and Japanese error response shapes', () => {
  const document = app.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'test', version: '1' } })
  const responses = document.paths?.['/api/directions']?.post?.responses
  expect(responses).toHaveProperty('400')
  expect(responses).toHaveProperty('403')
  expect(responses).toHaveProperty('413')
  expect(responses).toHaveProperty('429')
  expect(document.components?.schemas?.RouteResponse).toHaveProperty('oneOf')
})

test('five legs and 100-character names remain accepted', async () => {
  expect((await request({ legs: Array(5).fill({ ...leg, from: '駅'.repeat(100) }) })).status).toBe(200)
  expect(aiCalls).toBe(1)
})

test('whitespace-only endpoints are rejected before AI', async () => {
  expect((await request({ legs: [{ ...leg, from: '   ' }] })).status).toBe(400)
  expect(aiCalls).toBe(0)
})

test('unrelated successful AI endpoints are not cached', async () => {
  await request({ legs: [{ ...leg, from: '別店舗' }] })
  await request({ legs: [{ ...leg, from: '別店舗' }] })
  expect(aiCalls).toBe(2)
  expect(entries.size).toBe(0)
})
