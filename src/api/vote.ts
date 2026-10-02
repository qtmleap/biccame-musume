import { type RateLimitKeyFunc, rateLimit } from '@elithrar/workers-hono-rate-limit'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getPrisma } from '@/lib/prisma'
import { ipCheck } from '@/middleware/ip-check'
import {
  BulkVoteRequestSchema,
  BulkVoteResponseSchema,
  VoteCountListSchema,
  VoteErrorSchema,
  VoteResponseSchema
} from '@/schemas/vote.dto'
import { evaluateOnVote } from '@/services/badge'
import { pushEarnedBadges } from '@/services/badge-push'
import { bulkVote, getAllVoteCounts, vote } from '@/services/vote-service'
import type { Bindings, Variables } from '@/types/bindings'
import { getJwtPayload, verifyTokenOptional } from '@/utils/token'
import { getNextJSTDate, getNextJSTDateKey } from '@/utils/vote'

const getKey: RateLimitKeyFunc = (c: Context): string => {
  return `vote:${c.get('CLIENT_IP')}`
}

const rateLimiter = async (c: Context, next: Next) => {
  try {
    return await rateLimit(c.env.RATE_LIMITER, getKey)(c, next)
  } catch (error) {
    if (error instanceof HTTPException && error.status === 429) {
      throw new HTTPException(429, {
        message: '投票のリクエストが多すぎます。時間をおいて再度お試しください。',
        cause: error
      })
    }
    throw error
  }
}

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

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
    middleware: [ipCheck, rateLimiter, verifyTokenOptional],
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
            schema: VoteErrorSchema
          }
        },
        description: 'バリデーションエラー'
      },
      403: { content: { 'application/json': { schema: VoteErrorSchema } }, description: 'IPアドレス検証エラー' },
      429: { content: { 'application/json': { schema: VoteErrorSchema } }, description: 'レート制限エラー' },
      503: {
        content: { 'application/json': { schema: VoteErrorSchema } },
        description: 'キャラクター情報を取得できません'
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
    const results = await bulkVote(c.env, characterIds, c.get('CLIENT_IP'), userId, c.req.url)
    const votedCount = results.filter((r) => r.status === 'voted').length
    const skippedCount = results.filter((r) => r.status === 'skipped').length

    // 投票成功時のみ、最後に投票したキャラ ID で 1 回だけバッジ評価
    // (vote 系バッジは user-level なのでキャラ単位では評価しない)
    // 重いので waitUntil でバックグラウンド実行、レスポンスは即返す
    const lastVotedId =
      userId !== undefined && votedCount > 0
        ? results.filter((r) => r.status === 'voted').at(-1)?.characterId
        : undefined
    if (userId !== undefined && lastVotedId !== undefined) {
      const evalUserId = userId
      c.executionCtx.waitUntil(
        evaluateOnVote({ env: c.env, prisma: getPrisma(c.env), userId: evalUserId }, lastVotedId).then((badges) =>
          pushEarnedBadges(c.env, evalUserId, badges)
        )
      )
    }

    return c.json(
      {
        success: true,
        results,
        votedCount,
        skippedCount,
        nextVoteDate: getNextJSTDate(),
        newBadges: []
      },
      200
    )
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
    middleware: [ipCheck, rateLimiter, verifyTokenOptional],
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
            schema: VoteErrorSchema
          }
        },
        description: 'バリデーションエラーまたは投票済み'
      },
      403: { content: { 'application/json': { schema: VoteErrorSchema } }, description: 'IPアドレス検証エラー' },
      503: {
        content: { 'application/json': { schema: VoteErrorSchema } },
        description: 'キャラクター情報を取得できません'
      },
      429: {
        content: {
          'application/json': {
            schema: VoteErrorSchema
          }
        },
        description: 'レート制限エラー'
      },
      500: {
        content: {
          'application/json': {
            schema: VoteErrorSchema
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
    const { status } = await vote(c.env, characterId, c.get('CLIENT_IP'), userId, c.req.url)
    if (status === 'skipped') {
      throw new HTTPException(400, {
        message: JSON.stringify({
          success: false,
          message: '本日の投票は完了しています。明日また応援してください！',
          nextVoteDate: getNextJSTDateKey()
        })
      })
    }

    // バッジ評価は waitUntil でバックグラウンド実行、レスポンスは即返す
    if (userId !== undefined) {
      const evalUserId = userId
      c.executionCtx.waitUntil(
        evaluateOnVote({ env: c.env, prisma: getPrisma(c.env), userId: evalUserId }, characterId).then((badges) =>
          pushEarnedBadges(c.env, evalUserId, badges)
        )
      )
    }

    return c.json(
      {
        success: true,
        message: '投票ありがとうございます！',
        nextVoteDate: getNextJSTDate(),
        newBadges: []
      },
      200
    )
  }
)

export default routes
