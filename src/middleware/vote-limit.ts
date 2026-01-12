import dayjs from 'dayjs'
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Bindings, Variables } from '@/types/bindings'

/**
 * 開発環境かどうかを判定
 */
const isDevelopmentEnvironment = (c: Context): boolean => {
  const host = c.req.header('Host')
  return host?.includes('localhost') || host?.includes('127.0.0.1') || false
}

/**
 * 投票制限チェックMiddleware
 * 同じIPアドレスから同じキャラクターに対して1日1回のみ投票可能
 * 開発環境では投票済みでもエラーを返さずに投票を許可
 */
export const voteLimit = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const characterId = c.req.param('characterId')
  const ip = c.get('CLIENT_IP')
  const key = `${characterId}:${ip}`
  const isDev = isDevelopmentEnvironment(c)

  if (!characterId) {
    throw new HTTPException(400, { message: 'Bad Request' })
  }
  const currentTime = dayjs().toISOString()
  // 投票記録があるかをチェックする
  const value = await c.env.VOTE_LIMITER.get(key)
  if (value !== null) {
    if (isDev) {
      console.debug('[VoteLimit] Development environment detected, skipping vote limit check.')
      await next()
      return
    }
    throw new HTTPException(400, {
      message: JSON.stringify({
        success: false,
        message: '本日の投票は完了しています。明日また応援してください！',
        nextVoteDate: dayjs().add(1, 'day').format('YYYY-MM-DD')
      })
    })
  }
  // 投票記録を消す時間を設定
  const ttl = dayjs().add(1, 'day').startOf('day').diff(dayjs(), 'second')
  await c.env.VOTE_LIMITER.put(
    key,
    JSON.stringify({
      id: characterId,
      ip: ip,
      created_at: currentTime
    }),
    { expirationTtl: ttl }
  )
  await next()
}
