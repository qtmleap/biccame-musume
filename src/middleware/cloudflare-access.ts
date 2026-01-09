import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'

type AccessBindings = {
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
 * Cloudflare AccessのJWT公開鍵を取得
 */
const getPublicKeys = async (teamDomain: string): Promise<CryptoKey[]> => {
  const certsUrl = `https://${teamDomain}/cdn-cgi/access/certs`
  const response = await fetch(certsUrl)

  if (!response.ok) {
    throw new Error('Failed to fetch Cloudflare Access certificates')
  }

  const { keys } = (await response.json()) as { keys: JsonWebKey[] }

  const publicKeys = await Promise.all(
    keys.map((key) =>
      crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    )
  )

  return publicKeys
}

/**
 * JWTのデコード
 */
const decodeJwt = (token: string): { header: object; payload: AccessJWTPayload; signature: string } => {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const [headerB64, payloadB64, signature] = parts
  const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')))
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))

  return { header, payload, signature }
}

/**
 * JWTの署名を検証
 */
const verifySignature = async (token: string, publicKeys: CryptoKey[]): Promise<boolean> => {
  const parts = token.split('.')
  const signedData = `${parts[0]}.${parts[1]}`
  const signatureB64 = parts[2].replace(/-/g, '+').replace(/_/g, '/')
  const signature = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0))

  const encoder = new TextEncoder()
  const data = encoder.encode(signedData)

  for (const key of publicKeys) {
    try {
      const isValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)
      if (isValid) {
        return true
      }
    } catch {
      // 次の鍵を試す
    }
  }

  return false
}

/**
 * Cloudflare AccessのJWTを検証
 */
export const verifyAccessJwt = async (
  token: string,
  teamDomain: string,
  expectedAud: string
): Promise<AccessJWTPayload> => {
  const { payload } = decodeJwt(token)

  // 有効期限チェック
  const currentTime = Math.floor(Date.now() / 1000)
  if (payload.exp < currentTime) {
    throw new Error('Token has expired')
  }

  // Audience チェック
  if (!payload.aud.includes(expectedAud)) {
    throw new Error('Invalid audience')
  }

  // Issuer チェック
  const expectedIssuer = `https://${teamDomain}`
  if (payload.iss !== expectedIssuer) {
    throw new Error('Invalid issuer')
  }

  // 署名検証
  const publicKeys = await getPublicKeys(teamDomain)
  const isValid = await verifySignature(token, publicKeys)

  if (!isValid) {
    throw new Error('Invalid signature')
  }

  return payload
}

/**
 * Cloudflare Access認証ミドルウェア
 * ジェネリクスで任意のBindings型に対応
 */
export const cloudflareAccessMiddleware = async <T extends AccessBindings>(c: Context<{ Bindings: T }>, next: Next) => {
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
    await verifyAccessJwt(token, teamDomain, expectedAud)

    await next()
  } catch (error) {
    console.error('Access verification failed:', error)
    throw new HTTPException(401, { message: 'Invalid or expired token' })
  }
}
