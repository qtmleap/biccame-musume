import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createRemoteJWKSet, jwtVerify } from 'jose'

type Bindings = {
  CF_ACCESS_TEAM_DOMAIN: string
  CF_ACCESS_AUD: string
  ENVIRONMENT?: string
}

/**
 * Cloudflare Access JWT を署名検証する。 payload の内容は CFAuth では参照しないため
 * 戻り値は持たず、 検証失敗時のみ jwtVerify が throw する。
 */
const verifyJWT = async (token: string, teamDomain: string, audience: string): Promise<void> => {
  const jwksUrl = `https://${teamDomain}/cdn-cgi/access/certs`
  const jwks = createRemoteJWKSet(new URL(jwksUrl))

  await jwtVerify(token, jwks, {
    issuer: `https://${teamDomain}`,
    audience
  })
}

const extractTokenFromCookie = (cookie: string): string | undefined => {
  return cookie
    .split(';')
    .find((c) => c.trim().startsWith('CF_Authorization='))
    ?.split('=')[1]
    ?.trim()
}

/**
 * Cloudflare Access 認証ミドルウェア（必須）
 * 未認証・検証失敗は 401 を返す
 */
export const CFAuth = async <T extends Bindings>(c: Context<{ Bindings: T }>, next: Next) => {
  if (c.env.ENVIRONMENT === 'local') {
    console.log('[Dev] Cloudflare Access check skipped for development environment')
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
