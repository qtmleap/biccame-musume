import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Bindings, Variables } from '@/types/bindings'

/**
 * IPアドレスを取得
 */
const getClientIp = (c: Context): string => {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown'
}

/**
 * IPアドレスチェックMiddleware
 * クライアントIPを取得してContextに保存し、unknownの場合は403を返す
 */
export const ipCheck = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const ip = getClientIp(c)

  if (ip === 'unknown') {
    throw new HTTPException(403, { message: 'IP address not found' })
  }

  c.set('CLIENT_IP', ip)
  await next()
}
