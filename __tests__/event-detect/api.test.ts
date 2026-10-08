import { describe, expect, test } from 'bun:test'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { createApi } from '../../scripts/lib/event-detect/api'
import { fetchGoldEvents, type GoldEvent } from '../../scripts/lib/event-detect/gold'
import {
  EventDetailResponseSchema,
  KeywordsResponseSchema,
  LabelResponseSchema,
  type Labels,
  PostsResponseSchema,
  SummarySchema
} from '../../scripts/lib/event-detect/schema'

const EVENT_ID = '00000000-0000-4000-8000-000000000001'

const post = (id: string, text: string, overrides: Partial<DetectPost> = {}): DetectPost => ({
  id,
  createdAt: '2026-06-01T01:00:00.000Z',
  screenName: 'bic_example',
  kind: 'original',
  text,
  url: `https://x.com/bic_example/status/${id}`,
  media: [],
  ...overrides
})

const event: GoldEvent = {
  uuid: EVENT_ID,
  title: '夏名刺',
  category: 'limited_card',
  stores: ['example'],
  startDate: '2026-06-10T15:00:00.000Z',
  conditions: [{ type: 'first_come', quantity: 100 }],
  isPreliminary: false,
  referenceUrls: [{ type: 'announce', url: 'https://x.com/bic_example/status/1' }]
}

const setup = () => {
  const saved: Labels[] = []
  const api = createApi({
    posts: [
      post('1', '6/11から夏名刺を配布します'),
      post('2', 'RT: 名刺', { kind: 'retweet' }),
      post('3', 'アクキーかわいい', { createdAt: '2026-06-02T01:00:00.000Z' })
    ],
    events: [event],
    accounts: [{ storeId: 'example', name: '例たん', screenName: 'bic_example' }],
    source: {
      archive: '/tmp/posts.jsonl',
      from: '2025-10-07T15:00:00.000Z',
      until: '2026-10-08T00:00:00.000Z',
      complete: false,
      pages: 10,
      goldFetchedAt: '2026-10-08T00:00:00.000Z'
    },
    labels: {},
    saveLabels: async (labels) => {
      saved.push(labels)
    },
    now: () => '2026-10-08T01:00:00.000Z'
  })
  const call = (path: string, init?: RequestInit) => api.handle(new Request(`http://localhost${path}`, init))
  return { call, saved }
}

describe('event detect api', () => {
  test('summary はスキーマどおりの形で返す', async () => {
    const { call } = setup()
    const parsed = SummarySchema.safeParse(await (await call('/api/summary')).json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.funnel[0]).toMatchObject({ posts: 3, gold: 1 })
  })

  test('posts は範囲で絞り、新しい順に返す', async () => {
    const { call } = setup()
    const passed = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=passed')).json())
    expect(passed.data?.posts.map((entry) => entry.id)).toEqual(['3', '1'])
    const unlabeled = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=unlabeled')).json())
    expect(unlabeled.data?.posts.map((entry) => entry.id)).toEqual(['3'])
    const dropped = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=dropped&reason=retweet')).json())
    expect(dropped.data?.total).toBe(1)
  })

  test('posts の不正なクエリは 400', async () => {
    const { call } = setup()
    expect((await call('/api/posts?scope=unknown')).status).toBe(400)
  })

  test('ラベルを保存すると一覧に反映され、削除で戻る', async () => {
    const { call, saved } = setup()
    const put = await call('/api/labels/3', {
      method: 'PUT',
      body: JSON.stringify({ verdict: 'event', type: 'announce' })
    })
    expect(LabelResponseSchema.safeParse(await put.json()).data).toEqual({
      label: { verdict: 'event', type: 'announce', updatedAt: '2026-10-08T01:00:00.000Z' }
    })
    expect(saved).toHaveLength(1)
    const unlabeled = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=unlabeled')).json())
    expect(unlabeled.data?.total).toBe(0)
    await call('/api/labels/3', { method: 'DELETE' })
    expect(saved[1]).toEqual({})
  })

  test('存在しない投稿へのラベルと不正なラベルは拒否する', async () => {
    const { call, saved } = setup()
    expect((await call('/api/labels/999', { method: 'PUT', body: '{"verdict":"event"}' })).status).toBe(404)
    expect((await call('/api/labels/3', { method: 'PUT', body: '{"verdict":"maybe"}' })).status).toBe(400)
    expect(saved).toHaveLength(0)
  })

  test('イベント詳細は参考 URL がアーカイブにあるかと関連投稿を返す', async () => {
    const { call } = setup()
    const parsed = EventDetailResponseSchema.safeParse(await (await call(`/api/events/${EVENT_ID}`)).json())
    expect(parsed.data?.event.referenceUrls).toEqual([
      { type: 'announce', url: 'https://x.com/bic_example/status/1', archived: true }
    ])
    expect(parsed.data?.posts.map((entry) => entry.id)).toEqual(['1', '3'])
  })

  test('キーワードを無効にすると判定をやり直す', async () => {
    const { call } = setup()
    const response = await call('/api/keywords', { method: 'POST', body: JSON.stringify({ disabled: ['アクキー'] }) })
    const parsed = KeywordsResponseSchema.safeParse(await response.json())
    expect(parsed.data?.keywords.find((stat) => stat.keyword === 'アクキー')?.disabled).toBe(true)
    const passed = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=passed')).json())
    expect(passed.data?.posts.map((entry) => entry.id)).toEqual(['1'])
  })
})

describe('fetchGoldEvents', () => {
  test('JSON 以外の応答（Worker の 1101 等）は再試行する', async () => {
    const calls: string[] = []
    const responses = new Map<string, Response[]>([
      ['/api/events', [Response.json([{ uuid: EVENT_ID }])]],
      [`/api/events/${EVENT_ID}`, [new Response('error code: 1101', { status: 500 }), Response.json(event)]]
    ])
    const fetchImpl = async (input: string | URL | Request) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      calls.push(path)
      const next = responses.get(path)?.shift()
      if (!next) throw new Error(`unexpected ${path}`)
      return next
    }
    const events = await fetchGoldEvents({
      baseUrl: 'https://example.com',
      retryDelayMs: 0,
      fetchImpl: Object.assign(fetchImpl, { preconnect: () => {} })
    })
    expect(events).toEqual([event])
    expect(calls).toEqual(['/api/events', `/api/events/${EVENT_ID}`, `/api/events/${EVENT_ID}`])
  })
})
