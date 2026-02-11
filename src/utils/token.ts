import { getFirebaseToken } from '@hono/firebase-auth'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { FirebaseIdToken } from 'firebase-auth-cloudflare-workers'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { AlgorithmTypes, sign, verify } from 'hono/jwt'
import type { Bindings, Variables } from '@/types/bindings'

export const getToken = async (c: Context<{ Bindings: Bindings; Variables: Variables }>): Promise<string> => {
  const idToken: FirebaseIdToken | null = getFirebaseToken(c)
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

export const verifyToken: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const token: string | undefined = getCookie(c, 'session')
  if (token === undefined) {
    await next()
    return
  }
  try {
    const payload = await verify(token, c.env.JWT_SECRET_KEY, AlgorithmTypes.HS256)
    // JWTペイロードをコンテキストに保存
    c.set('jwtPayload', payload)
  } catch (error) {
    console.error('Token verification failed:', error)
    throw new HTTPException(401, { message: 'Invalid token' })
  }
  await next()
}

/**
 * クッキーからJWTペイロードを取得するヘルパー関数
 */
export const getJwtPayload = (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
  return c.get('jwtPayload') as
    | {
        sub: string
        uid: string
        usr: {
          email: string | null
          email_verified: boolean
          display_name: string | null
          thumbnail_url: string | null
        }
        iat: number
        exp: number
        iss: string
        aud: string
      }
    | undefined
}
