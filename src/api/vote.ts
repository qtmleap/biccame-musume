import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  AllVoteCountsSchema,
  VoteCountSchema,
  VoteErrorResponseSchema,
  VoteRequestSchema,
  VoteSuccessResponseSchema
} from '../schemas/vote.dto'
import { generateCountKey, generateVoteKey, getNextJSTDate } from '../utils/vote'

type Bindings = {
  VOTES: KVNamespace
}

export const routes = new OpenAPIHono<{ Bindings: Bindings }>()

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
    // リクエストボディのバリデーション
    const { characterId } = c.req.valid('json')

    // IPアドレス取得
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown'

    if (ip === 'unknown') {
      return c.json({ success: false, message: 'IP address not found' }, 400)
    }

    // 環境判定（開発環境かどうか）
    const isDevelopment = c.req.header('Host')?.includes('localhost') || c.req.header('Host')?.includes('127.0.0.1')

    // Rate Limiting: 開発環境以外では同一IPから1200秒間に60回まで
    if (!isDevelopment) {
      const identifier = `ratelimit:${ip}`
      const { success } = await c.env.VOTES.get(identifier).then((val) => {
        const count = val ? Number.parseInt(val, 10) : 0
        if (count >= 60) {
          return { success: false }
        }
        return { success: true }
      })

      if (!success) {
        return c.json(
          {
            success: false,
            message: '投票が多すぎます。しばらく待ってから再度お試しください。'
          },
          429
        )
      }

      // Rate Limitカウンタを更新（1200秒間有効）
      const currentCount = await c.env.VOTES.get(identifier)
      await c.env.VOTES.put(identifier, String((currentCount ? Number.parseInt(currentCount, 10) : 0) + 1), {
        expirationTtl: 1200
      })
    }

    // 開発環境以外では今日の投票チェック（JSTベース）
    if (!isDevelopment) {
      const voteKey = generateVoteKey(characterId, ip)
      const existingVote = await c.env.VOTES.get(voteKey)

      if (existingVote) {
        return c.json(
          {
            success: false,
            message: '本日は既に投票済みです',
            nextVoteDate: getNextJSTDate()
          },
          400
        )
      }

      // 投票を記録（JST0時までの秒数をTTLに設定）
      const now = new Date()
      const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
      const jstMidnight = new Date(jstNow)
      jstMidnight.setHours(24, 0, 0, 0)
      const ttl = Math.floor((jstMidnight.getTime() - jstNow.getTime()) / 1000)

      await c.env.VOTES.put(voteKey, new Date().toISOString(), { expirationTtl: ttl })
    }

    // カウントを増加
    const countKey = generateCountKey(characterId)
    const currentVoteCount = await c.env.VOTES.get(countKey)
    const newCount = (currentVoteCount ? Number.parseInt(currentVoteCount, 10) : 0) + 1

    // 値とメタデータの両方に件数を保存
    await c.env.VOTES.put(countKey, String(newCount), {
      metadata: { count: newCount }
    })

    return c.json({
      success: true,
      message: '投票ありがとうございます！',
      count: newCount,
      nextVoteDate: getNextJSTDate()
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: 'Invalid request' }, 400)
    }

    console.error('Vote error:', error)
    return c.json({ success: false, message: 'Internal server error' }, 500)
  }
})

/**
 * 全キャラクターの投票カウント取得
 * GET /api/votes
 */
routes.openapi(getAllVoteCountsRoute, async (c) => {
  try {
    const counts: Record<string, number> = {}
    let cursor: string | undefined

    // KVから全てのcount:*キーをメタデータ付きで取得
    do {
      const list = await c.env.VOTES.list<{ count: number }>({ prefix: 'count:', cursor })

      // メタデータから件数を取得
      for (const key of list.keys) {
        const characterId = key.name.replace('count:', '')
        counts[characterId] = key.metadata?.count || 0
      }

      cursor = list.list_complete ? undefined : list.cursor
    } while (cursor)

    return c.json(counts)
  } catch (error) {
    console.error('Get all votes error:', error)
    return c.json({}, 500)
  }
})
