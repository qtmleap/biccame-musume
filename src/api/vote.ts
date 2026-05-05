import { type RateLimitKeyFunc, rateLimit } from '@elithrar/workers-hono-rate-limit'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context, Next } from 'hono'
import { ipCheck } from '@/middleware/ip-check'
import { voteLimit } from '@/middleware/vote-limit'
import {
  BulkVoteRequestSchema,
  BulkVoteResponseSchema,
  VoteCountListSchema,
  VoteResponseSchema
} from '@/schemas/vote.dto'
import { bulkVote, getAllVoteCounts, vote } from '@/services/vote-service'
import type { Bindings, Variables } from '@/types/bindings'
import { getNextJSTDate } from '@/utils/vote'

const getKey: RateLimitKeyFunc = (c: Context): string => {
  // 匿名でも一括投票するため、Authorization が無ければ
  // CF-Connecting-IP / X-Real-IP をフォールバックキーにする
  return c.req.header('Authorization') || c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'anonymous'
}

const rateLimiter = async (c: Context, next: Next) => {
  return await rateLimit(c.env.RATE_LIMITER, getKey)(c, next)
}

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

routes.use('*', rateLimiter)

/**
 * 投票実行
 * POST /api/votes/:characterId
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/:characterId',
    middleware: [ipCheck, voteLimit],
    request: {
      params: z.object({
        characterId: z.string().nonempty()
      })
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
    const { characterId } = c.req.valid('param')
    c.executionCtx.waitUntil(vote(c.env, characterId, c.get('CLIENT_IP')))
    return c.json({
      success: true,
      message: '投票ありがとうございます！',
      nextVoteDate: getNextJSTDate()
    })
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

/**
 * 一括投票
 * POST /api/votes/bulk
 * - 推し一括 / 全員一括 共通エンドポイント
 * - 投票済みのキャラは skipped として返す
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/bulk',
    middleware: [ipCheck],
    request: {
      body: {
        content: {
          'application/json': {
            schema: BulkVoteRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: BulkVoteResponseSchema
          }
        },
        description: '一括投票完了（skip 含む）'
      },
      400: {
        content: {
          'application/json': {
            schema: BulkVoteResponseSchema
          }
        },
        description: 'バリデーションエラー'
      }
    },
    tags: ['votes']
  }),
  async (c) => {
    const { characterIds } = c.req.valid('json')
    const results = await bulkVote(c.env, characterIds, c.get('CLIENT_IP'))
    const votedCount = results.filter((r) => r.status === 'voted').length
    const skippedCount = results.filter((r) => r.status === 'skipped').length
    return c.json({
      success: true,
      results,
      votedCount,
      skippedCount,
      nextVoteDate: getNextJSTDate()
    })
  }
)

export default routes
