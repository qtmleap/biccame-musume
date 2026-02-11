import { verifyFirebaseAuth } from '@hono/firebase-auth'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { setCookie } from 'hono/cookie'
import { csrf } from 'hono/csrf'
import type { Bindings, Variables } from '@/types/bindings'
import { getToken } from '@/utils/token'

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
    const token = await getToken(c)
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
