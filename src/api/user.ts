import { getFirebaseToken, verifyFirebaseAuth } from '@hono/firebase-auth'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { ErrorResponseSchema, SuccessResponseSchema } from '@/schemas/user-activity.dto'
import { UpsertUserRequestSchema, UserResponseSchema } from '@/schemas/user.dto'
import { deleteUser, getUserById, upsertUser } from '@/services/user.service'
import type { Bindings, Variables } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * 開発環境かどうかを判定
 */
const isDevelopmentEnvironment = (host: string | undefined): boolean => {
  return host?.includes('localhost') || host?.includes('127.0.0.1') || host?.includes('dev.biccame-musume.com') || false
}

/**
 * Firebase認証ミドルウェア
 * 開発環境ではスキップ
 */
routes.use('*', async (c, next) => {
  const host = c.req.header('Host')

  // 開発環境ではスキップ
  if (isDevelopmentEnvironment(host)) {
    console.log('[Dev] Firebase auth check skipped for development environment')
    await next()
    return
  }

  const firebaseAuth = verifyFirebaseAuth({
    projectId: c.env.FIREBASE_PROJECT_ID
  })

  await firebaseAuth(c, next)
})

/**
 * 自分のユーザー情報取得
 * GET /api/users
 */
routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: UserResponseSchema
          }
        },
        description: 'ユーザー取得成功'
      },
      401: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: '認証エラー'
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: 'ユーザーが見つかりません'
      }
    },
    tags: ['users']
  }),
  async (c) => {
    const host = c.req.header('Host')
    let userId: string

    if (isDevelopmentEnvironment(host)) {
      // 開発環境ではクエリパラメータからユーザーIDを取得
      userId = c.req.query('userId') || 'dev-user'
    } else {
      const token = getFirebaseToken(c)
      if (!token?.uid) {
        throw new HTTPException(401, { message: 'Unauthorized' })
      }
      userId = token.uid
    }

    const user = await getUserById(c.env, userId)

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json(user, 200)
  }
)

/**
 * 自分のユーザー情報作成/更新
 * POST /api/users
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    request: {
      body: {
        content: {
          'application/json': {
            schema: UpsertUserRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: UserResponseSchema
          }
        },
        description: 'ユーザー作成/更新成功'
      },
      400: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: 'バリデーションエラー'
      },
      401: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: '認証エラー'
      },
      403: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: '権限エラー'
      }
    },
    tags: ['users']
  }),
  async (c) => {
    const body = c.req.valid('json')
    const host = c.req.header('Host')

    if (!isDevelopmentEnvironment(host)) {
      const token = getFirebaseToken(c)
      if (!token?.uid) {
        throw new HTTPException(401, { message: 'Unauthorized' })
      }
      // 自分以外のユーザー情報は更新できない
      if (token.uid !== body.id) {
        throw new HTTPException(403, { message: 'Access denied: user mismatch' })
      }
    }

    const user = await upsertUser(c.env, body)
    return c.json(user, 200)
  }
)

/**
 * 自分のユーザー情報削除
 * DELETE /api/users
 */
routes.openapi(
  createRoute({
    method: 'delete',
    path: '/',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SuccessResponseSchema
          }
        },
        description: 'ユーザー削除成功'
      },
      401: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: '認証エラー'
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: 'ユーザーが見つかりません'
      }
    },
    tags: ['users']
  }),
  async (c) => {
    const host = c.req.header('Host')
    let userId: string

    if (isDevelopmentEnvironment(host)) {
      userId = c.req.query('userId') || 'dev-user'
    } else {
      const token = getFirebaseToken(c)
      if (!token?.uid) {
        throw new HTTPException(401, { message: 'Unauthorized' })
      }
      userId = token.uid
    }

    const user = await deleteUser(c.env, userId)

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json({ success: true }, 200)
  }
)

export default routes
