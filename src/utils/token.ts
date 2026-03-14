import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { FirebaseIdToken } from 'firebase-auth-cloudflare-workers'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { AlgorithmTypes, sign, verify } from 'hono/jwt'
import type { Bindings, CustomJwtClaims, Variables } from '@/types/bindings'

export const signToken = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  idToken: FirebaseIdToken
): Promise<string> => {
  console.log('Firebase ID Token:', idToken)
  if (!idToken) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  const current_time: Dayjs = dayjs()
  const token = await sign(
    {
      sub: idToken.sub,
      iat: current_time.unix(),
      exp: current_time.add(1, 'hours').unix(),
      iss: new URL(c.req.url).host,
      aud: idToken.aud,
      uid: idToken.uid,
      usr: {
        email: idToken.email || null,
        email_verified: idToken.email_verified || false,
        display_name: idToken.name || null,
        thumbnail_url: idToken.picture || null
      },
      pid: undefined
    },
    c.env.JWT_SECRET_KEY,
    AlgorithmTypes.HS256
  )
  return token
}

/**
 * コンテキストからJWTペイロードを取得する
 */
export const getJwtPayload = (c: Context<{ Bindings: Bindings; Variables: Variables }>): CustomJwtClaims => {
  return c.get('jwtPayload')
}

export const verifyToken: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const token: string | undefined = getCookie(c, 'session')
  if (token === undefined) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  const result = (await verify(token, c.env.JWT_SECRET_KEY, AlgorithmTypes.HS256)) as CustomJwtClaims
  console.info('VerifyToken:', result)
  c.set('jwtPayload', result)
  await next()
}

/**
 * コンテキストからJWTペイロードのuidを取得する
 */
export const getToken = (c: Context<{ Bindings: Bindings; Variables: Variables }>): string => {
  const payload = getJwtPayload(c)
  console.info('GetToken:', payload)
  if (payload === undefined) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  return payload.uid
}
