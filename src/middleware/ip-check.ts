import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Bindings, Variables } from '@/types/bindings'

/**
 * IPアドレスを取得
 * CF-Connecting-IP のみを信頼する（クライアントが偽装可能な X-Real-IP は使用しない）
 * ローカル開発環境ではヘッダーが付与されないため 127.0.0.1 にフォールバックする
 */
const getClientIp = (c: Context<{ Bindings: Bindings; Variables: Variables }>): string => {
  const ip = c.req.header('CF-Connecting-IP')
  if (ip) {
    return ip
  }
  return c.env.ENVIRONMENT === 'local' ? '127.0.0.1' : 'unknown'
}

/**
 * IPアドレスチェックMiddleware
 * クライアントIPを取得してContextに保存し、unknownの場合は403を返す
 */
export const ipCheck = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const ip = getClientIp(c)

  if (ip === 'unknown') {
    throw new HTTPException(403, { message: 'Forbidden' })
  }

  c.set('CLIENT_IP', ip)
  await next()
}
