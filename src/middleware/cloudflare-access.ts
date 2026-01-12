import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createRemoteJWKSet, jwtVerify } from 'jose'

type Bindings = {
  CF_ACCESS_TEAM_DOMAIN: string
  CF_ACCESS_AUD: string
}

type AccessJWTPayload = {
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
export const verify = async (token: string, teamDomain: string, expectedAud: string): Promise<AccessJWTPayload> => {
  const certsUrl = `https://${teamDomain}/cdn-cgi/access/certs`
  const JWKS = createRemoteJWKSet(new URL(certsUrl))

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://${teamDomain}`,
    audience: expectedAud
  })

  return payload as AccessJWTPayload
}

/**
 * Cloudflare Access認証ミドルウェア
 * ジェネリクスで任意のBindings型に対応
 */
export const CFAuth = async <T extends Bindings>(c: Context<{ Bindings: T }>, next: Next) => {
  // ローカル環境では認証をスキップ
  if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
    return await next()
  }

  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN
  const expectedAud = c.env.CF_ACCESS_AUD

  if (!teamDomain || !expectedAud) {
    console.error('Missing Cloudflare Access configuration')
    throw new HTTPException(500, { message: 'Server configuration error' })
  }

  // CF-Access-Jwt-Assertion ヘッダーまたは Cookie から JWT を取得
  const jwtFromHeader = c.req.header('CF-Access-Jwt-Assertion')
  const cookieHeader = c.req.header('Cookie') || ''
  const jwtFromCookie = cookieHeader
    .split(';')
    .find((cookie) => cookie.trim().startsWith('CF_Authorization='))
    ?.split('=')[1]

  const token = jwtFromHeader || jwtFromCookie

  if (!token) {
    throw new HTTPException(401, { message: 'Authorization required' })
  }

  try {
    await verify(token, teamDomain, expectedAud)

    await next()
  } catch (error) {
    console.error('Access verification failed:', error)
    throw new HTTPException(401, { message: 'Invalid or expired token' })
  }
}
