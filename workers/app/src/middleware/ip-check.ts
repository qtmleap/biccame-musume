import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
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
 * クライアントIPを取得してContextに保存し、不正なアドレスの場合は403を返す
 */
export const ipCheck = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const ip = getClientIp(c)

  if (!z.union([z.ipv4(), z.ipv6()]).safeParse(ip).success) {
    throw new HTTPException(403, { message: '接続元のIPアドレスを確認できませんでした。再度お試しください。' })
  }

  c.set('CLIENT_IP', ip)
  await next()
}
