import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { FirebaseIdToken } from 'firebase-auth-cloudflare-workers'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { AlgorithmTypes, sign, verify } from 'hono/jwt'
import { z } from 'zod'
import type { Bindings, CustomJwtClaims, Variables } from '@/types/bindings'

/**
 * `verify()` から返ってくる JWT payload を実行時に検証するスキーマ。
 * `CustomJwtClaims` と整合するフィールドだけ検証し、標準クレーム (sub/iat/exp/iss/aud 等) は
 * passthrough で透過させる。 スキーマと検証失敗をきちんと型で扱うことで、
 * verify 直後の `as CustomJwtClaims` キャストを排除する。
 *
 * 注意: `sign()` に `pid: undefined` を渡すと JSON.stringify で drop され、 verify で
 * 復元される payload に `pid` キーが存在しない。 現行 zod では `z.undefined()` は
 * 「キーが missing」を nonoptional として reject するため、 pid は schema から除外する
 * (どのみち検証対象にする意味も無い)。
 */
const CustomJwtClaimsSchema = z
  .object({
    uid: z.string().nonempty(),
    usr: z.object({
      email: z.string().nullable(),
      email_verified: z.boolean(),
      display_name: z.string().nullable(),
      thumbnail_url: z.string().nullable()
    })
  })
  .passthrough()

/**
 * `hono/jwt` の verify が返した unknown payload を検証し、 CustomJwtClaims として確定させる
 */
const parseJwtPayload = (raw: unknown): CustomJwtClaims | null => {
  const result = CustomJwtClaimsSchema.safeParse(raw)
  if (!result.success) return null
  return result.data
}

export const signToken = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  idToken: FirebaseIdToken
): Promise<string> => {
  if (!idToken) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  if (!c.env.JWT_SECRET_KEY) {
    throw new HTTPException(500, { message: 'JWT_SECRET_KEY is not configured' })
  }
  const current_time: Dayjs = dayjs()
  const token = await sign(
    {
      sub: idToken.sub,
      iat: current_time.unix(),
      exp: current_time.add(5, 'days').unix(),
      iss: new URL(c.req.url).host,
      aud: idToken.aud,
      uid: idToken.uid,
      usr: {
        email: idToken.email || null,
        email_verified: idToken.email_verified || false,
        display_name: idToken.name || null,
        thumbnail_url: idToken.picture || null
      }
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
  if (!c.env.JWT_SECRET_KEY) {
    throw new HTTPException(500, { message: 'JWT_SECRET_KEY is not configured' })
  }
  const raw = await verify(token, c.env.JWT_SECRET_KEY, AlgorithmTypes.HS256)
  const payload = parseJwtPayload(raw)
  if (payload === null) {
    throw new HTTPException(401, { message: 'Invalid token payload' })
  }
  c.set('jwtPayload', payload)
  await next()
}

/**
 * 認証は任意。session Cookie があれば検証して jwtPayload をセット、なければ素通し。
 * 検証失敗もエラーにせず素通し（公開エンドポイントにログインユーザー情報を付加するだけ）。
 */
export const verifyTokenOptional: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const token: string | undefined = getCookie(c, 'session')
  if (token === undefined || !c.env.JWT_SECRET_KEY) {
    await next()
    return
  }
  try {
    const raw = await verify(token, c.env.JWT_SECRET_KEY, AlgorithmTypes.HS256)
    const payload = parseJwtPayload(raw)
    if (payload !== null) {
      c.set('jwtPayload', payload)
    } else {
      console.warn('verifyTokenOptional: payload shape mismatch, continuing as anonymous')
    }
  } catch (error) {
    console.warn('verifyTokenOptional: invalid session token, continuing as anonymous:', error)
  }
  await next()
}

/**
 * コンテキストからJWTペイロードのuidを取得する
 */
export const getToken = (c: Context<{ Bindings: Bindings; Variables: Variables }>): string => {
  const payload = getJwtPayload(c)
  if (payload === undefined) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  return payload.uid
}
