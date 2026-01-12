import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createRemoteJWKSet, jwtVerify } from 'jose'

type Bindings = {
  CF_ACCESS_TEAM_DOMAIN: string
  CF_ACCESS_AUD: string
}

type JWTPayload = {
  aud: string[]
  email: string
  exp: number
  iat: number
  iss: string
  sub: string
  type: string
}

/**
 * Cloudflare AccessのJWTを検証
 */
const verifyJWT = async (token: string, teamDomain: string, audience: string): Promise<JWTPayload> => {
  const jwksUrl = `https://${teamDomain}/cdn-cgi/access/certs`
  const jwks = createRemoteJWKSet(new URL(jwksUrl))

  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://${teamDomain}`,
    audience
  })

  return payload as JWTPayload
}

/**
 * CookieヘッダーからJWTトークンを抽出
 */
const extractTokenFromCookie = (cookie: string): string | undefined => {
  return cookie
    .split(';')
    .find((c) => c.trim().startsWith('CF_Authorization='))
    ?.split('=')[1]
    ?.trim()
}

/**
 * Cloudflare Access認証ミドルウェア（開発環境では自動スキップ）
 */
export const CFAuth = async <T extends Bindings>(c: Context<{ Bindings: T }>, next: Next) => {
  // 開発環境では認証をスキップ
  if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
    await next()
    return
  }

  const { CF_ACCESS_TEAM_DOMAIN: teamDomain, CF_ACCESS_AUD: audience } = c.env

  const headerToken = c.req.header('CF-Access-Jwt-Assertion')
  const cookieToken = extractTokenFromCookie(c.req.header('Cookie') || '')
  const token = headerToken || cookieToken

  if (!token) {
    throw new HTTPException(401, { message: 'Authorization required' })
  }

  try {
    await verifyJWT(token, teamDomain, audience)
    await next()
  } catch (error) {
    console.error('Access verification failed:', error)
    throw new HTTPException(401, { message: 'Invalid or expired token' })
  }
}
