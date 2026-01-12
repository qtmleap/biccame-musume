import { type RateLimitKeyFunc, rateLimit } from '@elithrar/workers-hono-rate-limit'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { VoteCountListSchema, VoteRequestSchema, VoteResponseSchema } from '@/schemas/vote.dto'
import { castVote, getAllVoteCounts } from '@/services/vote.service'
import type { Bindings } from '@/type/bindings'

const getKey: RateLimitKeyFunc = (c: Context): string => {
  // Rate limit on each API token by returning it as the key for our
  // middleware to use.
  return c.req.header('Authorization') || ''
}

const rateLimiter = async (c: Context, next: Next) => {
  return await rateLimit(c.env.RATE_LIMITER, getKey)(c, next)
}

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

routes.use('*', rateLimiter)

/**
 * IPアドレスを取得
 */
const getClientIp = (c: Context): string => {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown'
}

/**
 * 開発環境かどうかを判定
 */
const isDevelopmentEnvironment = (c: Context): boolean => {
  const host = c.req.header('Host')
  return host?.includes('localhost') || host?.includes('127.0.0.1') || false
}

/**
 * 投票実行
 * POST /api/votes
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    request: {
      body: {
        content: {
          'application/json': {
            schema: VoteRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: VoteResponseSchema
          }
        },
        description: '投票成功'
      },
      400: {
        content: {
          'application/json': {
            schema: VoteResponseSchema
          }
        },
        description: 'バリデーションエラーまたは投票済み'
      },
      429: {
        content: {
          'application/json': {
            schema: VoteResponseSchema
          }
        },
        description: 'レート制限エラー'
      },
      500: {
        content: {
          'application/json': {
            schema: VoteResponseSchema
          }
        },
        description: 'サーバーエラー'
      }
    },
    tags: ['votes']
  }),
  async (c) => {
    try {
      const { characterId } = c.req.valid('json')
      const ip = getClientIp(c)
      const isDevelopment = isDevelopmentEnvironment(c)

      const result = await castVote(c.env, characterId, ip, isDevelopment)

      if (!result.success) {
        return c.json(result, 400)
      }

      return c.json(result)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, { message: 'Invalid request' })
      }
      if (error instanceof HTTPException) {
        throw error
      }

      console.error('Vote error:', error)
      throw new HTTPException(500, { message: 'Internal server error' })
    }
  }
)

/**
 * 全キャラクターの投票カウント取得（D1から取得）
 * GET /api/votes
 */
routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: VoteCountListSchema
          }
        },
        description: '全キャラクターの投票カウント取得成功'
      },
      500: {
        content: {
          'application/json': {
            schema: z.object({})
          }
        },
        description: 'サーバーエラー'
      }
    },
    tags: ['votes']
  }),
  async (c) => {
    const counts = await getAllVoteCounts(c.env)
    return c.json(counts)
  }
)

export default routes
