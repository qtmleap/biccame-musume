import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { VoteRequestSchema } from '../schemas/vote.dto'
import { generateCountKey, generateVoteKey, getNextJSTDate } from '../utils/vote'

type Bindings = {
  VOTES: KVNamespace
}

export const voteRoutes = new Hono<{ Bindings: Bindings }>()

// CORS設定
voteRoutes.use('*', cors())

/**
 * 投票カウント取得
 * GET /api/votes/:characterId
 */
voteRoutes.get('/:characterId', async (c) => {
  const characterId = c.req.param('characterId')
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
voteRoutes.post('/', async (c) => {
  try {
    // リクエストボディのバリデーション
    const body = await c.req.json()
    const { characterId } = VoteRequestSchema.parse(body)

    // IPアドレス取得
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown'

    if (ip === 'unknown') {
      return c.json({ success: false, message: 'IP address not found' }, 400)
    }

    // 環境判定（開発環境かどうか）
    const isDevelopment = c.req.header('Host')?.includes('localhost') || c.req.header('Host')?.includes('127.0.0.1')

    // Rate Limiting: 開発環境以外では同一IPから1分間に5回まで
    if (!isDevelopment) {
      const identifier = `ratelimit:${ip}`
      const { success } = await c.env.VOTES.get(identifier).then((val) => {
        const count = val ? Number.parseInt(val, 10) : 0
        if (count >= 5) {
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

      // Rate Limitカウンタを更新（1分間有効）
      const currentCount = await c.env.VOTES.get(identifier)
      await c.env.VOTES.put(identifier, String((currentCount ? Number.parseInt(currentCount, 10) : 0) + 1), {
        expirationTtl: 60
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
    await c.env.VOTES.put(countKey, String(newCount))

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
voteRoutes.get('/', async (c) => {
  // KVから全てのカウントを取得するのは効率が悪いので、
  // 必要に応じて実装を検討
  return c.json({ message: 'Not implemented yet' }, 501)
})
