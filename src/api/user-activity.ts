import { getFirebaseToken, verifyFirebaseAuth } from '@hono/firebase-auth'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import {
  EventIdParamSchema,
  EventsResponseSchema,
  StoreKeyParamSchema,
  StoresResponseSchema,
  SuccessResponseSchema,
  UserActivityResponseSchema,
  UserActivityUserIdParamSchema
} from '@/schemas/user-activity.dto'
import {
  addCompletedEvent,
  addInterestedEvent,
  addVisitedStore,
  getCompletedEvents,
  getInterestedEvents,
  getUserActivity,
  getVisitedStores,
  removeCompletedEvent,
  removeInterestedEvent,
  removeVisitedStore
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
    path: '/:userId',
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
      params: UserActivityUserIdParamSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: StoresResponseSchema
          }
        },
        description: '訪問済み店舗一覧取得成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId } = c.req.valid('param')
    const stores = await getVisitedStores(c.env, userId)
    return c.json({ stores })
  }
)

routes.openapi(
  createRoute({
    method: 'post',
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
        description: '店舗を訪問済みに追加成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, storeKey } = c.req.valid('param')
    await addVisitedStore(c.env, userId, storeKey)
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
        description: '店舗を訪問済みから削除成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, storeKey } = c.req.valid('param')
    await removeVisitedStore(c.env, userId, storeKey)
    return c.json({ success: true })
  }
)

// ===== 興味のあるイベント =====

routes.openapi(
  createRoute({
    method: 'get',
    path: '/:userId/interested',
    request: {
      params: UserActivityUserIdParamSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: EventsResponseSchema
          }
        },
        description: '興味のあるイベント一覧取得成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId } = c.req.valid('param')
    const events = await getInterestedEvents(c.env, userId)
    return c.json({ events })
  }
)

routes.openapi(
  createRoute({
    method: 'post',
    path: '/:userId/interested/:eventId',
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
        description: 'イベントを興味ありに追加成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, eventId } = c.req.valid('param')
    await addInterestedEvent(c.env, userId, eventId)
    return c.json({ success: true })
  }
)

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/:userId/interested/:eventId',
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
        description: 'イベントを興味ありから削除成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, eventId } = c.req.valid('param')
    await removeInterestedEvent(c.env, userId, eventId)
    return c.json({ success: true })
  }
)

// ===== 達成済みイベント =====

routes.openapi(
  createRoute({
    method: 'get',
    path: '/:userId/completed',
    request: {
      params: UserActivityUserIdParamSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: EventsResponseSchema
          }
        },
        description: '達成済みイベント一覧取得成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId } = c.req.valid('param')
    const events = await getCompletedEvents(c.env, userId)
    return c.json({ events })
  }
)

routes.openapi(
  createRoute({
    method: 'post',
    path: '/:userId/completed/:eventId',
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
        description: 'イベントを達成済みに追加成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, eventId } = c.req.valid('param')
    await addCompletedEvent(c.env, userId, eventId)
    return c.json({ success: true })
  }
)

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/:userId/completed/:eventId',
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
        description: 'イベントを達成済みから削除成功'
      }
    },
    tags: ['user-activity']
  }),
  async (c) => {
    const { userId, eventId } = c.req.valid('param')
    await removeCompletedEvent(c.env, userId, eventId)
    return c.json({ success: true })
  }
)

export default routes
