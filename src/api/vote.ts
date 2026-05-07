import { type RateLimitKeyFunc, rateLimit } from '@elithrar/workers-hono-rate-limit'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context, Next } from 'hono'
import { getPrisma } from '@/lib/prisma'
import { ipCheck } from '@/middleware/ip-check'
import { voteLimit } from '@/middleware/vote-limit'
import { prismaBadgeToDto } from '@/schemas/badge.dto'
import {
  BulkVoteRequestSchema,
  BulkVoteResponseSchema,
  VoteCountListSchema,
  VoteResponseSchema
} from '@/schemas/vote.dto'
import { evaluateOnVote } from '@/services/badge-evaluator'
import { bulkVote, getAllVoteCounts, vote } from '@/services/vote-service'
import type { Bindings, Variables } from '@/types/bindings'
import { getJwtPayload, verifyTokenOptional } from '@/utils/token'
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
 * - NOTE: /:characterId より先に登録しないと bulk が characterId として吸収される
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/bulk',
    middleware: [ipCheck, verifyTokenOptional],
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
    const userId = (() => {
      try {
        return getJwtPayload(c).uid
      } catch {
        return undefined
      }
    })()
    const results = await bulkVote(c.env, characterIds, c.get('CLIENT_IP'), userId)
    const votedCount = results.filter((r) => r.status === 'voted').length
    const skippedCount = results.filter((r) => r.status === 'skipped').length

    // 投票成功時のみ、最後に投票したキャラ ID で 1 回だけバッジ評価
    // (vote 系バッジは user-level なのでキャラ単位では評価しない)
    const lastVotedId =
      userId !== undefined && votedCount > 0
        ? results.filter((r) => r.status === 'voted').at(-1)?.characterId
        : undefined
    const newBadges =
      userId !== undefined && lastVotedId !== undefined
        ? (await evaluateOnVote({ env: c.env, prisma: getPrisma(c.env), userId }, lastVotedId)).map((b) =>
            prismaBadgeToDto(b)
          )
        : []

    return c.json({
      success: true,
      results,
      votedCount,
      skippedCount,
      nextVoteDate: getNextJSTDate(),
      newBadges
    })
  }
)

/**
 * 投票実行
 * POST /api/votes/:characterId
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/:characterId',
    middleware: [ipCheck, voteLimit, verifyTokenOptional],
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
    const userId = (() => {
      try {
        return getJwtPayload(c).uid
      } catch {
        return undefined
      }
    })()
    await vote(c.env, characterId, c.get('CLIENT_IP'), userId)

    const newBadges =
      userId !== undefined
        ? (await evaluateOnVote({ env: c.env, prisma: getPrisma(c.env), userId }, characterId)).map((b) =>
            prismaBadgeToDto(b)
          )
        : []

    return c.json({
      success: true,
      message: '投票ありがとうございます！',
      nextVoteDate: getNextJSTDate(),
      newBadges
    })
  }
)

export default routes
