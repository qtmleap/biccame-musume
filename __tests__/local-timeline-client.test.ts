import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { Client } from '../scripts/lib/timeline/client'
import { SearchVariablesSchema } from '../scripts/lib/timeline/schemas/variables.dto'
import { dayjs } from '../scripts/lib/timeline/utils/dayjs'

const env = {
  TWITTER_AUTH_TOKEN: 'test-auth',
  TWITTER_BEARER_TOKEN: 'test-bearer',
  TWITTER_CSRF_TOKEN: 'test-csrf'
}
const since = dayjs('2026-10-03T00:00:00.000Z')
const until = dayjs('2026-10-03T00:05:00.000Z')
const page = {
  data: { search_by_raw_query: { search_timeline: { timeline: { instructions: [] } } } }
}
const fetchSpies: ReturnType<typeof spyOn>[] = []
afterEach(() => {
  for (const spy of fetchSpies) spy.mockRestore()
  fetchSpies.length = 0
})
const mockFetch = (handler: (...args: Parameters<typeof fetch>) => Promise<Response>) => {
  const spy = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(handler, { preconnect: () => {} }))
  fetchSpies.push(spy)
  return spy
}
const variablesOf = (request: Request): unknown => {
  const variables = new URL(request.url).searchParams.get('variables')
  if (!variables) throw new Error('Missing timeline variables')
  return JSON.parse(variables)
}

test('local timeline variables remain Latest/count20 and are serialized', () => {
  const parsed = SearchVariablesSchema.safeParse({ rawQuery: 'test' })
  if (!parsed.success) throw new Error('Invalid variables')
  expect(JSON.parse(parsed.data)).toEqual({
    rawQuery: 'test',
    count: 20,
    querySource: 'typed_query',
    product: 'Latest',
    withGrokTranslatedBio: false
  })
})

test('local signed timeline request retains list query, params transform and credentials', async () => {
  const captured: Request[] = []
  mockFetch(async (input, init) => {
    captured.push(new Request(input, init))
    return Response.json(page)
  })
  const generate = mock(async () => 'test-signature')
  const client = new Client(env, async () => ({ generateTransactionId: generate }))
  await client.search({ since, until })
  expect(captured).toHaveLength(1)
  const request = captured[0]
  expect(request.headers.get('x-client-transaction-id')).toBe('test-signature')
  expect(request.headers.get('authorization')).toBe('Bearer test-bearer')
  expect(request.headers.get('cookie')).toBe('auth_token=test-auth; ct0=test-csrf')
  expect(request.headers.get('x-csrf-token')).toBe('test-csrf')
  expect(variablesOf(request)).toMatchObject({
    rawQuery: 'list:2019028800869413128 since:2026-10-03 until:2026-10-04',
    count: 20,
    product: 'Latest'
  })
  expect(generate).toHaveBeenCalledWith('GET', '/i/api/graphql/rkp6b4vtR9u7v3naGoOzUQ/SearchTimeline')
})

test('local archive list override retains signed search and the inclusive-until adapter', async () => {
  const requests: Request[] = []
  mockFetch(async (input, init) => {
    const request = new Request(input, init)
    requests.push(request)
    expect(request.headers.get('x-client-transaction-id')).toBe('archive-signature')
    return Response.json(page)
  })
  const client = new Client(env, async () => ({ generateTransactionId: async () => 'archive-signature' }))
  await client.search({ since, until, listId: '123456' })
  expect(variablesOf(requests[0])).toMatchObject({
    rawQuery: 'list:123456 since:2026-10-03 until:2026-10-04',
    count: 20,
    product: 'Latest'
  })
})

test('local signature failure does not make an unsigned request or expose its cause', async () => {
  const fetch = mockFetch(async () => {
    throw new Error('unexpected fetch')
  })
  const client = new Client(env, async () => {
    throw new Error('secret-like-source')
  })
  await expect(client.search({ since, until })).rejects.toThrow('Bot timeline failure: signature')
  expect(fetch).not.toHaveBeenCalled()
})

test('local X rate limit exposes only a safe classification', async () => {
  mockFetch(async () => new Response('secret-like-response', { status: 429 }))
  const client = new Client(env, async () => ({ generateTransactionId: async () => 'test' }))
  await expect(client.search({ since, until })).rejects.toMatchObject({ kind: 'rate_limited', status: 429 })
})
