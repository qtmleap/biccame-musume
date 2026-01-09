import { type RateLimitBinding, type RateLimitKeyFunc, rateLimit } from '@elithrar/workers-hono-rate-limit'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  AllVoteCountsSchema,
  VoteCountSchema,
  VoteErrorResponseSchema,
  VoteRequestSchema,
  VoteSuccessResponseSchema
} from '../schemas/vote.dto'
import { generateCountKey, generateVoteKey, getNextJSTDate } from '../utils/vote'

dayjs.extend(utc)
dayjs.extend(timezone)

type Bindings = {
  VOTES: KVNamespace
  RATE_LIMITER: RateLimitBinding
}

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
// ルート定義
const getVoteCountRoute = createRoute({
  method: 'get',
  path: '/:characterId',
  request: {
    params: z.object({
      characterId: z.string().openapi({ example: 'biccame-001' })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: VoteCountSchema
        }
      },
      description: '投票カウント取得成功'
    }
  },
  tags: ['votes']
})

const postVoteRoute = createRoute({
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
          schema: VoteSuccessResponseSchema
        }
      },
      description: '投票成功'
    },
    400: {
      content: {
        'application/json': {
          schema: VoteErrorResponseSchema
        }
      },
      description: 'バリデーションエラーまたは投票済み'
    },
    429: {
      content: {
        'application/json': {
          schema: VoteErrorResponseSchema
        }
      },
      description: 'レート制限エラー'
    },
    500: {
      content: {
        'application/json': {
          schema: VoteErrorResponseSchema
        }
      },
      description: 'サーバーエラー'
    }
  },
  tags: ['votes']
})

const getAllVoteCountsRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AllVoteCountsSchema
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
})

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
 * 投票の重複チェック
 */
const checkDuplicateVote = async (votesKV: KVNamespace, characterId: string, ip: string): Promise<boolean> => {
  const voteKey = generateVoteKey(characterId, ip)
  const existingVote = await votesKV.get(voteKey)
  return existingVote !== null
}

/**
 * 投票を記録（JST0時までの秒数をTTLに設定）
 */
const recordVote = async (votesKV: KVNamespace, characterId: string, ip: string): Promise<void> => {
  const jstNow = dayjs()
  const jstMidnight = jstNow.endOf('day')
  const ttl = jstMidnight.diff(jstNow, 'second')

  const voteKey = generateVoteKey(characterId, ip)
  await votesKV.put(voteKey, dayjs().toISOString(), { expirationTtl: ttl })
}

/**
 * カウント更新処理
 */
const updateVoteCount = async (votesKV: KVNamespace, characterId: string): Promise<void> => {
  try {
    const countKey = generateCountKey(characterId)
    const currentVoteCount = await votesKV.get(countKey)
    const newCount = (currentVoteCount ? Number.parseInt(currentVoteCount, 10) : 0) + 1

    await votesKV.put(countKey, String(newCount), {
      metadata: { count: newCount }
    })
  } catch (error) {
    console.error('Vote count update error:', error)
  }
}

/**
 * 投票カウント取得
 * GET /api/votes/:characterId
 */
routes.openapi(getVoteCountRoute, async (c) => {
  const { characterId } = c.req.valid('param')
  const countKey = generateCountKey(characterId)

  const count = await c.env.VOTES.get(countKey)

  return c.json({
    characterId,
    count: count ? Number.parseInt(count, 10) : 0
  })
})

/**
 * 投票実行
 * POST /api/votes
 */
routes.openapi(postVoteRoute, async (c) => {
  try {
    const { characterId } = c.req.valid('json')
    const ip = getClientIp(c)

    if (ip === 'unknown') {
      throw new HTTPException(400, { message: 'IP address not found' })
    }

    const isDevelopment = isDevelopmentEnvironment(c)

    if (!isDevelopment) {
      const hasDuplicateVote = await checkDuplicateVote(c.env.VOTES, characterId, ip)

      if (hasDuplicateVote) {
        return c.json(
          {
            success: false,
            message: '本日は既に投票済みです',
            nextVoteDate: getNextJSTDate()
          },
          400
        )
      }

      await recordVote(c.env.VOTES, characterId, ip)
    }

    c.executionCtx.waitUntil(updateVoteCount(c.env.VOTES, characterId))

    return c.json({
      success: true,
      message: '投票ありがとうございます！',
      nextVoteDate: getNextJSTDate()
    })
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
})

/**
 * 全キャラクターの投票カウント取得
 * GET /api/votes
 */
routes.openapi(getAllVoteCountsRoute, async (c) => {
  try {
    const currentYear = dayjs().year()
    const prefix = `count:${currentYear}`

    // KVから全ての今年の投票カウントキーをメタデータ付きで一括取得
    const list = await c.env.VOTES.list<{ count: number }>({ prefix })

    // メタデータから件数を取得してオブジェクトを作成
    const counts = Object.fromEntries(list.keys.map((key) => [key.name.replace(prefix, ''), key.metadata?.count || 0]))

    return c.json(counts)
  } catch (error) {
    console.error('Get all votes error:', error)
    throw new HTTPException(500, { message: 'Failed to get vote counts' })
  }
})

export default routes
