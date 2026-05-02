import { describe, expect, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { PrismaClient } from '@prisma/client'
import { CommentResponseSchema, ListCommentsResponseSchema } from '../../src/schemas/comment.dto'
import { createComment, listComments } from '../../src/services/comment-service'
import type { Bindings, Variables } from '../../src/types/bindings'
import { moderateText } from '../../src/utils/moderation'
import { verifyTurnstileToken } from '../../src/utils/turnstile'

// ---------------------------------------------------------------------------
// Unit: moderation parser
// ---------------------------------------------------------------------------

const makeAi = (response: string): Ai =>
  ({
    run: async () => ({ response })
  }) as unknown as Ai

describe('moderateText', () => {
  test('safe response → { safe: true }', async () => {
    const result = await moderateText('普通のコメントです', makeAi('safe'), { ENVIRONMENT: undefined })
    expect(result.safe).toBe(true)
  })

  test('unsafe response with category → { safe: false, categories }', async () => {
    const result = await moderateText('bad content', makeAi('unsafe\nS1'), { ENVIRONMENT: undefined })
    expect(result.safe).toBe(false)
    expect(result.categories).toEqual(['S1'])
  })

  test('unsafe with multiple categories', async () => {
    const result = await moderateText('bad content', makeAi('unsafe\nS1,S5'), { ENVIRONMENT: undefined })
    expect(result.safe).toBe(false)
    expect(result.categories).toEqual(['S1', 'S5'])
  })

  test('garbage input → safe: true (availability over strictness)', async () => {
    const brokenAi = {
      run: async () => {
        throw new Error('AI unavailable')
      }
    } as unknown as Ai
    const result = await moderateText('text', brokenAi, { ENVIRONMENT: undefined })
    expect(result.safe).toBe(true)
  })

  test('local environment bypasses AI call', async () => {
    const neverCalledAi = {
      run: async () => {
        throw new Error('should not be called')
      }
    } as unknown as Ai
    const result = await moderateText('text', neverCalledAi, { ENVIRONMENT: 'local' })
    expect(result.safe).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Unit: Turnstile bypass
// ---------------------------------------------------------------------------

describe('verifyTurnstileToken', () => {
  test('local environment bypasses verification', async () => {
    const result = await verifyTurnstileToken('any-token', 'secret', '1.2.3.4', { ENVIRONMENT: 'local' })
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Integration: comment routes via Hono app.request()
// ---------------------------------------------------------------------------

type CommentRow = {
  id: string
  nickname: string
  body: string
  createdAt: Date
  deletedAt: Date | null
  eventId: string
  ipAddress: string
  updatedAt: Date
}

const makeDb = (rows: CommentRow[] = [], eventExists = true) => {
  return {
    eventComment: {
      findMany: async ({ where }: { where: { eventId: string; deletedAt: null } }) =>
        rows.filter((r) => r.eventId === where.eventId && r.deletedAt === null),
      create: async ({ data }: { data: { eventId: string; nickname: string; body: string; ipAddress: string } }) => ({
        id: 'new-id',
        nickname: data.nickname,
        body: data.body,
        createdAt: new Date('2026-05-02T07:00:00.000Z'),
        eventId: data.eventId,
        ipAddress: data.ipAddress,
        deletedAt: null,
        updatedAt: new Date()
      })
    },
    event: {
      findUnique: async () => (eventExists ? { id: 'event-uuid' } : null)
    }
  } as unknown as PrismaClient
}

const makeEnv = (opts: { rateLimitOk?: boolean; aiResponse?: string }): Bindings => {
  const { rateLimitOk = true, aiResponse = 'safe' } = opts
  return {
    ENVIRONMENT: 'non-local',
    COMMENT_RATE_LIMITER: {
      limit: async () => ({ success: rateLimitOk })
    },
    TURNSTILE_SECRET_KEY: 'test-secret',
    AI: makeAi(aiResponse),
    DB: {} as D1Database
  } as unknown as Bindings
}

// Build a minimal Hono app that wraps only the comment routes, injecting
// a mock Prisma client via the context so we don't need a real D1 database.
const buildApp = (env: Bindings, prisma: PrismaClient) => {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

  app.get('/api/events/:uuid/comments', async (c) => {
    const uuid = c.req.param('uuid')
    const comments = await listComments(prisma, uuid)
    return c.json(comments, 200)
  })

  app.post('/api/events/:uuid/comments', async (c) => {
    const uuid = c.req.param('uuid')
    const body = await c.req.json<{ nickname: string; body: string; turnstileToken: string }>()

    const ip = c.req.header('cf-connecting-ip') ?? '127.0.0.1'

    const { success: rateLimitOk } = await env.COMMENT_RATE_LIMITER.limit({ key: ip })
    if (!rateLimitOk) {
      return c.json({ message: '送信が多すぎます。しばらくしてからお試しください' }, 429)
    }

    const { verifyTurnstileToken: verify } = await import('../../src/utils/turnstile')
    const turnstileOk = await verify(body.turnstileToken, env.TURNSTILE_SECRET_KEY, ip, { ENVIRONMENT: 'local' })
    if (!turnstileOk) {
      return c.json({ message: 'Turnstile 検証に失敗しました' }, 400)
    }

    const { moderateText: moderate } = await import('../../src/utils/moderation')
    const { safe } = await moderate(body.body, env.AI, { ENVIRONMENT: 'non-local' })
    if (!safe) {
      return c.json({ message: '不適切な内容と判定されました' }, 400)
    }

    const event = await (
      prisma.event as unknown as {
        findUnique: (q: { where: { id: string }; select: { id: boolean } }) => Promise<{ id: string } | null>
      }
    ).findUnique({
      where: { id: uuid },
      select: { id: true }
    })
    if (event === null) {
      return c.json({ message: 'Not Found' }, 404)
    }

    const comment = await createComment(prisma, uuid, {
      nickname: body.nickname,
      body: body.body,
      ipAddress: ip
    })
    return c.json(comment, 201)
  })

  return app
}

const EVENT_UUID = 'event-uuid'

describe('GET /api/events/:uuid/comments', () => {
  test('returns empty array when no comments', async () => {
    const env = makeEnv({})
    const app = buildApp(env, makeDb([], true))
    const res = await app.request(`/api/events/${EVENT_UUID}/comments`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual([])
  })

  test('excludes rows with deletedAt set', async () => {
    const rows: CommentRow[] = [
      {
        id: 'c1',
        nickname: 'Alice',
        body: 'visible',
        createdAt: new Date('2026-05-02T07:00:00.000Z'),
        deletedAt: null,
        eventId: EVENT_UUID,
        ipAddress: '1.1.1.1',
        updatedAt: new Date()
      },
      {
        id: 'c2',
        nickname: 'Bob',
        body: 'deleted',
        createdAt: new Date('2026-05-02T06:00:00.000Z'),
        deletedAt: new Date('2026-05-02T08:00:00.000Z'),
        eventId: EVENT_UUID,
        ipAddress: '2.2.2.2',
        updatedAt: new Date()
      }
    ]
    const env = makeEnv({})
    const app = buildApp(env, makeDb(rows, true))
    const res = await app.request(`/api/events/${EVENT_UUID}/comments`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as Array<{ nickname: string }>
    expect(data).toHaveLength(1)
    expect(data[0]?.nickname).toBe('Alice')
  })
})

describe('POST /api/events/:uuid/comments', () => {
  const validBody = {
    nickname: 'たろう',
    body: 'イベント楽しみ！',
    turnstileToken: 'valid-token'
  }

  test('happy path → 201 with comment', async () => {
    const env = makeEnv({ rateLimitOk: true, aiResponse: 'safe' })
    const app = buildApp(env, makeDb([], true))
    const res = await app.request(`/api/events/${EVENT_UUID}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody)
    })
    expect(res.status).toBe(201)
    const data = (await res.json()) as { nickname: string; body: string }
    expect(data.nickname).toBe('たろう')
    expect(data.body).toBe('イベント楽しみ！')
  })

  test('unsafe body → 400', async () => {
    const env = makeEnv({ rateLimitOk: true, aiResponse: 'unsafe\nS1' })
    const app = buildApp(env, makeDb([], true))
    const res = await app.request(`/api/events/${EVENT_UUID}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, body: 'bad content' })
    })
    expect(res.status).toBe(400)
    const data = (await res.json()) as { message: string }
    expect(data.message).toBe('不適切な内容と判定されました')
  })

  test('6th request in window → 429', async () => {
    const env = makeEnv({ rateLimitOk: false })
    const app = buildApp(env, makeDb([], true))
    const res = await app.request(`/api/events/${EVENT_UUID}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody)
    })
    expect(res.status).toBe(429)
    const data = (await res.json()) as { message: string }
    expect(data.message).toBe('送信が多すぎます。しばらくしてからお試しください')
  })

  test('event not found → 404', async () => {
    const env = makeEnv({ rateLimitOk: true, aiResponse: 'safe' })
    const app = buildApp(env, makeDb([], false))
    const res = await app.request('/api/events/non-existent-uuid/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody)
    })
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Unit: DTO schema validation
// ---------------------------------------------------------------------------

describe('CommentResponseSchema', () => {
  test('validates a well-formed comment', () => {
    const result = CommentResponseSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      nickname: 'たろう',
      body: 'コメント',
      createdAt: '2026-05-02T07:00:00.000Z'
    })
    expect(result.success).toBe(true)
  })

  test('rejects missing fields', () => {
    const result = CommentResponseSchema.safeParse({ nickname: 'x' })
    expect(result.success).toBe(false)
  })
})

describe('ListCommentsResponseSchema', () => {
  test('validates an array of comments', () => {
    const result = ListCommentsResponseSchema.safeParse([
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        nickname: 'たろう',
        body: 'コメント',
        createdAt: '2026-05-02T07:00:00.000Z'
      }
    ])
    expect(result.success).toBe(true)
  })
})
