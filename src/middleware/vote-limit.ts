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
 */
export const voteLimit = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const characterId = c.req.param('characterId')
  const ip = c.get('CLIENT_IP')
  const isDevelopment = isDevelopmentEnvironment(c)

  if (!characterId) {
    console.error(characterId)
    throw new HTTPException(400, { message: 'Bad Request' })
  }

  // 開発環境では投票制限をスキップ
  if (isDevelopment) {
    console.log('[Dev] Vote limit check skipped for development environment')
    await next()
    return
  }

  const currentDate = dayjs().format('YYYY-MM-DD')
  const lastVoteDate = await c.env.VOTE_LIMITER.get(`vote:${characterId}:${ip}`)
  if (lastVoteDate === currentDate) {
    const nextDay = dayjs().add(1, 'day').startOf('day')
    throw new HTTPException(400, {
      message: JSON.stringify({
        success: false,
        message: '本日の投票は完了しています。明日また応援してください！',
        nextVoteDate: nextDay.toISOString()
      })
    })
  }
  await next()
}
