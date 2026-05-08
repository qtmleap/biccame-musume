import dayjs from 'dayjs'
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Bindings, Variables } from '@/types/bindings'

const buildKey = (characterId: string, ip: string): string => `${characterId}:${ip}`

/**
 * 指定キャラ × IP の本日投票済みフラグを取得
 */
export const isVoteLimited = async (kv: KVNamespace, characterId: string, ip: string): Promise<boolean> => {
  return (await kv.get(buildKey(characterId, ip))) !== null
}

/**
 * 投票記録を KV に書き込む（翌日0時に expire）
 */
export const markVoteLimited = async (kv: KVNamespace, characterId: string, ip: string): Promise<void> => {
  const ttl = dayjs().add(1, 'day').startOf('day').diff(dayjs(), 'second')
  await kv.put(
    buildKey(characterId, ip),
    JSON.stringify({
      id: characterId,
      ip,
      created_at: dayjs().toISOString()
    }),
    { expirationTtl: ttl }
  )
}

/**
 * 投票制限チェックMiddleware
 * 同じIPアドレスから同じキャラクターに対して1日1回のみ投票可能
 * 開発環境では投票済みでもエラーを返さずに投票を許可
 */
export const voteLimit = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const characterId = c.req.param('characterId')
  const ip = c.get('CLIENT_IP')
  const isDev = c.env.ENVIRONMENT === 'local'

  if (!characterId) {
    throw new HTTPException(400, { message: 'Bad Request' })
  }

  if (await isVoteLimited(c.env.VOTE_LIMITER, characterId, ip)) {
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

  await markVoteLimited(c.env.VOTE_LIMITER, characterId, ip)
  await next()
}
