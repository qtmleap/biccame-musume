import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { v5 as uuidv5 } from 'uuid'
import { z } from 'zod'
import { handleBotScheduled } from '../workers/bot/src/scheduled'
import { Client } from '../workers/bot/src/timeline/client'
import { characters } from '../workers/bot/src/timeline/data/characters'
import { PostSchema } from '../workers/bot/src/timeline/schemas/response.dto'
import { SearchVariablesSchema } from '../workers/bot/src/timeline/schemas/variables.dto'
import { parseTweet, type TweetExtraction } from '../workers/bot/src/timeline/utils/ai'
import type { Bindings } from '../workers/bot/src/timeline/utils/bindings'
import { dayjs } from '../workers/bot/src/timeline/utils/dayjs'
import { TimelineFailure } from '../workers/bot/src/timeline/utils/failure'
import {
  buildCandidatePayload,
  collectWindow,
  extract,
  notify,
  post,
  sendCandidate,
  type TweetInfo,
  withinPeriod
} from '../workers/bot/src/timeline/utils/post'
import { getTimelineWindow } from '../workers/bot/src/timeline/utils/scheduled'

const env: Bindings = {
  TWITTER_AUTH_TOKEN: 'test-auth',
  TWITTER_BEARER_TOKEN: 'test-bearer',
  TWITTER_CSRF_TOKEN: 'test-csrf',
  DISCORD_CHANNEL_ID: '123',
  DISCORD_TOKEN: 'test-discord',
  OPENAI_API_KEY: 'test-ai',
  OPENAI_BASE_URL: 'https://ai.invalid/v1',
  OPENAI_MODEL: 'test-model'
}
const tweet: TweetInfo = {
  id: '12345',
  name: '架空の店舗',
  screenName: 'bic_abeno',
  createdAt: '2026-10-03T00:02:00.000Z',
  text: 'テスト用の名刺配布開始',
  url: 'https://x.com/bic_abeno/status/12345'
}
const extraction: TweetExtraction = {
  isDistributionEvent: true,
  eventType: 'start',
  title: 'テスト名刺',
  category: 'limited_card',
  startDate: '2026-10-03',
  endDate: null,
  endAt: null
}
const since = dayjs('2026-10-03T00:00:00.000Z')
const until = dayjs('2026-10-03T00:05:00.000Z')
const makePage = (tweets: TweetInfo[], cursor?: string) => {
  const entries = tweets.map((item) => ({
    content: {
      itemContent: {
        tweet_results: {
          result: {
            core: { user_results: { result: { core: { name: item.name, screen_name: item.screenName } } } },
            legacy: { id_str: item.id, created_at: item.createdAt, full_text: item.text }
          }
        }
      }
    }
  }))
  const parsed = PostSchema.safeParse({
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: {
            instructions: [
              { entries: [...entries, ...(cursor ? [{ content: { cursorType: 'Bottom', value: cursor } }] : [])] }
            ]
          }
        }
      }
    }
  })
  if (!parsed.success) throw new Error('Invalid synthetic page')
  return parsed.data
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

test('legacy execution clock preserves five minutes, zero seconds and milliseconds in JST', () => {
  const { since: start, until: end } = getTimelineWindow(() => dayjs('2026-10-03T00:05:37.123Z'))
  expect(start.format('YYYY-MM-DDTHH:mm:ss.SSSZ')).toBe('2026-10-03T09:00:00.123+09:00')
  expect(end.format('YYYY-MM-DDTHH:mm:ss.SSSZ')).toBe('2026-10-03T09:05:00.123+09:00')
  expect(
    withinPeriod(
      [
        { ...tweet, createdAt: '2026-10-03T00:00:00.122Z' },
        { ...tweet, createdAt: '2026-10-03T00:00:00.123Z' },
        { ...tweet, createdAt: '2026-10-03T00:05:00.123Z' }
      ],
      start,
      end
    )
  ).toHaveLength(1)
})

test('timeline variables remain Latest/count20 and are serialized', () => {
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

test('pagination deduplicates tweets and stops once an older tweet covers the lower bound', async () => {
  const search = mock(async () => makePage([tweet, tweet], 'next'))
  search.mockResolvedValueOnce(makePage([tweet, tweet], 'next'))
  search.mockResolvedValueOnce(makePage([{ ...tweet, id: 'older', createdAt: '2026-10-02T23:59:59Z' }], 'unused'))
  const result = await collectWindow({ search }, since, until)
  expect(result.pages).toBe(2)
  expect(result.exhausted).toBe(false)
  expect(result.tweets.map((item) => item.id)).toEqual(['12345', 'older'])
})

test('pagination stops at a repeated cursor and caps at five pages', async () => {
  const repeated = mock(async () => makePage([tweet], 'same'))
  expect((await collectWindow({ search: repeated }, since, until)).pages).toBe(2)
  let page = 0
  const search = mock(async () => makePage([tweet], `cursor-${++page}`))
  expect(await collectWindow({ search }, since, until)).toMatchObject({ pages: 5, exhausted: true })
  expect(extract(makePage([tweet, tweet]))).toHaveLength(1)
})

test('signed timeline request retains list query, params transform and credentials', async () => {
  const captured: Request[] = []
  mockFetch(async (input, init) => {
    captured.push(new Request(input, init))
    return Response.json(makePage([tweet]))
  })
  const generate = mock(async () => 'test-signature')
  const client = new Client(
    {
      TWITTER_AUTH_TOKEN: env.TWITTER_AUTH_TOKEN,
      TWITTER_BEARER_TOKEN: env.TWITTER_BEARER_TOKEN,
      TWITTER_CSRF_TOKEN: env.TWITTER_CSRF_TOKEN
    },
    async () => ({ generateTransactionId: generate })
  )
  await client.search({ since, until })
  expect(captured).toHaveLength(1)
  const request = captured[0]
  expect(request.headers.get('x-client-transaction-id')).toBe('test-signature')
  const url = new URL(request.url)
  expect(JSON.parse(url.searchParams.get('variables') || '{}')).toMatchObject({
    rawQuery: 'list:2019028800869413128 since:2026-10-03 until:2026-10-04',
    count: 20,
    product: 'Latest'
  })
  expect(generate).toHaveBeenCalledWith('GET', '/i/api/graphql/rkp6b4vtR9u7v3naGoOzUQ/SearchTimeline')
})

test('signature failure does not make an unsigned request or expose its cause', async () => {
  const fetch = mockFetch(async () => {
    throw new Error('unexpected fetch')
  })
  const client = new Client(env, async () => {
    throw new Error('secret-like-source')
  })
  await expect(client.search({ since, until })).rejects.toThrow('Bot timeline failure: signature')
  expect(fetch).not.toHaveBeenCalled()
})

test('X rate limit exposes only a safe classification', async () => {
  mockFetch(async () => new Response('secret-like-response', { status: 429 }))
  const client = new Client(env, async () => ({ generateTransactionId: async () => 'test' }))
  await expect(client.search({ since, until })).rejects.toMatchObject({ kind: 'rate_limited', status: 429 })
})

test('candidate UUIDs use the legacy namespace and distribution-filtered indices', async () => {
  const analyze = mock(async () => [
    { ...extraction, isDistributionEvent: false },
    extraction,
    { ...extraction, eventType: 'end' as const }
  ])
  const send = mock(async () => {})
  const payloads = await post(env, tweet, { analyze, send })
  expect(send).toHaveBeenCalledTimes(2)
  for (const [index, payload] of payloads.entries()) {
    const url = new URL(payload.components?.[0].components[1].url || 'https://invalid.test')
    const uuid = uuidv5(index === 0 ? tweet.id : `${tweet.id}:${index}`, '6ba7b810-9dad-11d1-80b4-00c04fd430c8')
    expect(url.pathname).toBe(`/admin/events/${uuid}`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: 'limited_card',
      title: 'テスト名刺',
      stores: 'abeno',
      referenceUrls: tweet.url,
      startDate: '2026-10-03'
    })
    expect(payload.components?.[0].components.map((button) => button.label)).toEqual(['ツイートを見る', '作成'])
    expect(payload).not.toHaveProperty('allowed_mentions')
  }
})

test('all 40 legacy store mappings match canonical public data before shared extraction', async () => {
  const parsed = z
    .array(
      z.object({
        id: z.string().nonempty(),
        character: z.object({
          name: z.string().max(1000).optional(),
          twitter_id: z.string().max(1000).optional()
        })
      })
    )
    .safeParse(await Bun.file(new URL('../workers/app/public/characters.json', import.meta.url)).json())
  if (!parsed.success) throw new Error('Invalid canonical character data')
  expect(characters).toHaveLength(40)
  for (const legacy of characters) {
    const canonical = parsed.data.find((character) => character.id === legacy.id)
    expect(canonical).toBeDefined()
    expect(canonical?.character.name).toBe(legacy.name)
    expect(canonical?.character.twitter_id).toBe(legacy.twitter_id)
  }
})

test('unknown store is analyzed then skipped and case-sensitive mapping remains intact', async () => {
  const analyze = mock(async () => [extraction])
  const send = mock(async () => {})
  expect(await post(env, { ...tweet, screenName: 'unknown' }, { analyze, send })).toEqual([])
  expect(analyze).toHaveBeenCalledTimes(1)
  expect(send).not.toHaveBeenCalled()
  expect(characters.find((character) => character.twitter_id === 'Bic_kawasaki')?.id).toBe('kawasaki')
  expect(characters.find((character) => character.twitter_id === 'bic_kawasaki')).toBeUndefined()
})

test('dry-run returns the same candidate payloads without sending Discord requests', async () => {
  const send = mock(async () => {
    throw new Error('Dry run sent a message')
  })
  const candidates = await notify(env, since, until, {
    client: { search: async () => makePage([tweet, { ...tweet, id: 'unrelated', text: 'テスト挨拶' }]) },
    analyze: async () => [extraction],
    send,
    dryRun: true
  })
  expect(candidates).toEqual([buildCandidatePayload(tweet, extraction, 'abeno', 0)])
  expect(send).not.toHaveBeenCalled()
})

test.each([429, 403, 500])('Discord rejection %i never recurses or logs the body', async (status) => {
  const fetch = mockFetch(async () => new Response('secret-like-body', { status }))
  await expect(sendCandidate(env, buildCandidatePayload(tweet, extraction, 'abeno', 0))).rejects.toMatchObject({
    kind: status === 429 ? 'rate_limited' : 'discord_rejected',
    status
  })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('Discord network/timeout ambiguity is not automatically resent', async () => {
  const fetch = mockFetch(async () => {
    throw new Error('private network details')
  })
  await expect(sendCandidate(env, buildCandidatePayload(tweet, extraction, 'abeno', 0))).rejects.toMatchObject({
    kind: 'delivery_unknown'
  })
  expect(fetch).toHaveBeenCalledTimes(1)
})

const aiResponse = (text: string, status = 'completed', refusal = false) => ({
  id: 'synthetic-response',
  object: 'response',
  status,
  output: [
    {
      type: 'message',
      id: 'synthetic-message',
      role: 'assistant',
      status: 'completed',
      content: refusal
        ? [{ type: 'refusal', refusal: 'test refusal' }]
        : [{ type: 'output_text', text, annotations: [] }]
    }
  ]
})

test('Responses API keeps model/prompt/schema contract and normalizes blank values', async () => {
  const bodies: unknown[] = []
  mockFetch(async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    return Response.json(aiResponse(JSON.stringify({ events: [{ ...extraction, endDate: '', endAt: '' }] })))
  })
  expect(await parseTweet(env, tweet)).toEqual([extraction])
  expect(bodies[0]).toMatchObject({
    model: 'test-model',
    input: tweet.text,
    text: { format: { type: 'json_schema', strict: true, name: 'tweet_extraction' } }
  })
})

test.each([
  aiResponse('{}', 'incomplete'),
  aiResponse('', 'completed', true),
  aiResponse(''),
  aiResponse('invalid-json'),
  aiResponse(JSON.stringify({ events: [{ ...extraction, category: 'invalid' }] }))
])('AI incomplete/refusal/empty/malformed output is rejected without Discord', async (response) => {
  mockFetch(async () => Response.json(response))
  await expect(parseTweet(env, tweet)).rejects.toThrow()
})

test('AI does not fall back to process environment when a binding is missing', async () => {
  const fetch = mockFetch(async () => {
    throw new Error('unexpected AI request')
  })
  await expect(parseTweet({ ...env, OPENAI_API_KEY: '' }, tweet)).rejects.toThrow('binding is required')
  expect(fetch).not.toHaveBeenCalled()
})

test('scheduled gate needs enabled flag and all bindings; daily cron never runs TL', async () => {
  const run = mock(async () => {})
  const info = spyOn(console, 'info').mockImplementation(() => {})
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await handleBotScheduled({ cron: '*/5 0-12 * * *' }, env, run)
    await handleBotScheduled({ cron: '*/5 0-12 * * *' }, { TL_NOTIFICATIONS_ENABLED: 'true' }, run)
    await handleBotScheduled({ cron: '0 0 * * *' }, { ...env, TL_NOTIFICATIONS_ENABLED: 'true' }, run)
    expect(run).not.toHaveBeenCalled()
    await handleBotScheduled({ cron: '*/5 0-12 * * *' }, { ...env, TL_NOTIFICATIONS_ENABLED: 'true' }, run)
    expect(run).toHaveBeenCalledTimes(1)
    run.mockRejectedValueOnce(new TimelineFailure('delivery_unknown'))
    await handleBotScheduled({ cron: '*/5 0-12 * * *' }, { ...env, TL_NOTIFICATIONS_ENABLED: 'true' }, run)
    expect(error.mock.calls).toEqual([
      ['bot scheduled: configuration failure'],
      ['bot scheduled: timeline failure', { kind: 'delivery_unknown', status: undefined }]
    ])
  } finally {
    info.mockRestore()
    error.mockRestore()
  }
})
