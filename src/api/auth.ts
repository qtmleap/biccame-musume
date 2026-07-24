import { getFirebaseToken, verifyFirebaseAuth } from '@hono/firebase-auth'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { FirebaseIdToken } from 'firebase-auth-cloudflare-workers'
import { setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { getPrisma } from '@/lib/prisma'
import type { Bindings, Variables } from '@/types/bindings'
import { signToken } from '@/utils/token'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>({
  defaultHook: (result) => {
    if (!result.success) {
      throw result.error
    }
  }
})

/**
 * Firebase ID Token 検証ミドルウェア。
 * emulator host は local (miniflare) でのみ渡す。 staging/production で
 * これを渡してしまうと @hono/firebase-auth が useEmulator=true と判断し、
 * 署名検証をスキップした上で JWK 取得を localhost に飛ばそうとして機能不全になる。
 */
const firebaseAuthMiddleware = (env: Bindings) =>
  verifyFirebaseAuth({
    projectId: env.FIREBASE_PROJECT_ID,
    firebaseEmulatorHost: env.ENVIRONMENT === 'local' ? 'localhost:9099' : undefined
  })

routes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    middleware: [
      async (c, next) => {
        const middleware = firebaseAuthMiddleware(c.env)
        return middleware(c, next)
      }
    ],
    responses: {
      200: {
        description: '認証成功'
      },
      400: {
        description: '不正なリクエスト'
      },
      401: {
        description: '認証エラー'
      }
    }
  }),
  async (c) => {
    const idToken: FirebaseIdToken | null = getFirebaseToken(c)
    if (idToken === null) {
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    const client = getPrisma(c.env)
    await client.user.upsert({
      where: {
        id: idToken.uid
      },
      update: {},
      create: {
        id: idToken.uid,
        displayName: idToken.name || null,
        thumbnailURL: idToken.picture || null,
        screenName: null,
        email: idToken.email || null
      }
    })
    const token = await signToken(c, idToken)
    // secure は local (http) では無効。 sameSite / path は Cookie が /api/me/* や
    // WebSocket /api/me/ws に確実に届くよう明示する。
    setCookie(c, 'session', token, {
      maxAge: 60 * 60 * 24 * 5,
      httpOnly: true,
      secure: c.env.ENVIRONMENT !== 'local',
      sameSite: 'Lax',
      path: '/'
    })
    return c.json({
      success: true
    })
  }
)

export default routes
