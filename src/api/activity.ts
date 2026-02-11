import { getFirebaseToken, verifyFirebaseAuth } from '@hono/firebase-auth'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import {
  EventIdParamSchema,
  EventsQuerySchema,
  EventsResponseSchema,
  StoreKeyParamSchema,
  StoresQuerySchema,
  StoresResponseSchema,
  SuccessResponseSchema,
  UpdateEventStatusSchema,
  UpdateStoreStatusSchema,
  UserActivityResponseSchema,
  UserActivityUserIdParamSchema
} from '@/schemas/activity.dto'
import {
  deleteUserEvent,
  deleteUserStore,
  getUserActivity,
  getUserEvents,
  getUserStores,
  updateUserEvent,
  updateUserStore
} from '@/services/user-activity.service'
import type { Bindings, Variables } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * 開発環境かどうかを判定
 */
const isDevelopmentEnvironment = (host: string | undefined): boolean => {
  return host?.includes('localhost') || host?.includes('127.0.0.1') || false
}

/**
 * Firebase認証ミドルウェアを適用（書き込み操作のみ）
 * 開発環境ではスキップ
 */
routes.use('/:userId/*', async (c, next) => {
  const host = c.req.header('Host')

  // 開発環境ではスキップ
  if (isDevelopmentEnvironment(host)) {
    console.log('[Dev] Firebase auth check skipped for development environment')
    await next()
    return
  }

  // GETリクエストは認証不要（読み取りのみ）
  if (c.req.method === 'GET') {
    await next()
    return
  }

  // POST/DELETE等の書き込み操作は認証必須
  const firebaseAuth = verifyFirebaseAuth({
    projectId: c.env.FIREBASE_PROJECT_ID
  })

  await firebaseAuth(c, async () => {
    // 認証されたユーザーIDとリクエストされたuserIdが一致するか確認
    const token = getFirebaseToken(c)
    const requestedUserId = c.req.param('userId')

    if (token?.uid !== requestedUserId) {
      throw new HTTPException(403, { message: 'Access denied: user mismatch' })
    }

    await next()
  })
})

// ===== ユーザーアクティビティ全体 =====

routes.openapi(
  createRoute({
    method: 'get',
    path: '/:userId/activities',
    request: {
      params: UserActivityUserIdParamSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: UserActivityResponseSchema
          }
        },
        description: 'ユーザーアクティビティ取得成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId } = c.req.valid('param')
    const activity = await getUserActivity(c.env, userId)
    return c.json(activity)
  }
)

// ===== 訪問済み店舗 =====

routes.openapi(
  createRoute({
    method: 'get',
    path: '/:userId/stores',
    request: {
      params: UserActivityUserIdParamSchema,
      query: StoresQuerySchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: StoresResponseSchema
          }
        },
        description: '店舗一覧取得成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId } = c.req.valid('param')
    const { status } = c.req.valid('query')
    const stores = await getUserStores(c.env, userId, status)
    return c.json({ stores })
  }
)

routes.openapi(
  createRoute({
    method: 'put',
    path: '/:userId/stores/:storeKey',
    request: {
      params: StoreKeyParamSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateStoreStatusSchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SuccessResponseSchema
          }
        },
        description: '店舗ステータス更新成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, storeKey } = c.req.valid('param')
    const { status } = c.req.valid('json')
    await updateUserStore(c.env, userId, storeKey, status)
    return c.json({ success: true })
  }
)

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/:userId/stores/:storeKey',
    request: {
      params: StoreKeyParamSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SuccessResponseSchema
          }
        },
        description: '店舗を削除成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, storeKey } = c.req.valid('param')
    await deleteUserStore(c.env, userId, storeKey)
    return c.json({ success: true })
  }
)

// ===== イベント（統合） =====

routes.openapi(
  createRoute({
    method: 'get',
    path: '/:userId/events',
    request: {
      params: UserActivityUserIdParamSchema,
      query: EventsQuerySchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: EventsResponseSchema
          }
        },
        description: 'イベント一覧取得成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId } = c.req.valid('param')
    const { status } = c.req.valid('query')
    const events = await getUserEvents(c.env, userId, status)
    return c.json({ events })
  }
)

routes.openapi(
  createRoute({
    method: 'put',
    path: '/:userId/events/:eventId',
    request: {
      params: EventIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateEventStatusSchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SuccessResponseSchema
          }
        },
        description: 'イベントステータス更新成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, eventId } = c.req.valid('param')
    const { status } = c.req.valid('json')
    await updateUserEvent(c.env, userId, eventId, status)
    return c.json({ success: true })
  }
)

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/:userId/events/:eventId',
    request: {
      params: EventIdParamSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SuccessResponseSchema
          }
        },
        description: 'イベント削除成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, eventId } = c.req.valid('param')
    await deleteUserEvent(c.env, userId, eventId)
    return c.json({ success: true })
  }
)

export default routes
