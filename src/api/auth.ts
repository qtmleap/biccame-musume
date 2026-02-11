import { getFirebaseToken, verifyFirebaseAuth } from '@hono/firebase-auth'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'
import type { FirebaseIdToken } from 'firebase-auth-cloudflare-workers'
import { setCookie } from 'hono/cookie'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
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
 * Firebase認証ミドルウェア
 * 開発環境ではスキップ
 */
// routes.use('*', async (c, next) => {
//   verifyFirebaseAuth({
//     projectId: c.env.FIREBASE_PROJECT_ID,
//     firebaseEmulatorHost: 'localhost:9099'
//   })
//   await next()
// })
routes.use('*', csrf())

/**
 * ページビュー統計取得
 * GET /api/stats
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    middleware: [
      verifyFirebaseAuth({
        projectId: 'biccame-musume',
        firebaseEmulatorHost: 'localhost:9099'
      })
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
    console.log(c.req.raw)
    const idToken: FirebaseIdToken | null = getFirebaseToken(c)
    if (idToken === null) {
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    const client = new PrismaClient({ adapter: new PrismaD1(c.env.DB) })
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
    setCookie(c, 'session', token, {
      maxAge: 60 * 60 * 24 * 5,
      httpOnly: true,
      secure: true
    })
    return c.json({
      success: true
    })
  }
)

export default routes
