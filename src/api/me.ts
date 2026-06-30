import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { getPrisma } from '@/lib/prisma'
import {
  EventDeleteQuerySchema,
  EventIdParamSchema,
  EventsQuerySchema,
  EventsResponseSchema,
  StoreKeyParamSchema,
  StoresQuerySchema,
  StoresResponseSchema,
  SuccessResponseSchema,
  UpdateEventResponseSchema,
  UpdateEventStatusSchema,
  UpdateStoreResponseSchema,
  UpdateStoreStatusSchema,
  UserActivityResponseSchema
} from '@/schemas/activity.dto'
import type { StoreKey } from '@/schemas/store.dto'
import { evaluateOnEventComplete, evaluateOnVisit } from '@/services/badge-evaluator'
import { pushEarnedBadges } from '@/services/badge-push'
import { getEvent } from '@/services/event-service'
import {
  deleteUserEvent,
  deleteUserStore,
  getUserActivity,
  getUserEvents,
  getUserStores,
  updateUserEvent,
  updateUserStore
} from '@/services/me-service'
import type { Bindings, Variables } from '@/types/bindings'
import { getToken, verifyToken } from '@/utils/token'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

// ===== ユーザーアクティビティ全体 =====

routes.openapi(
  createRoute({
    method: 'get',
    path: '/me/activities',
    middleware: [verifyToken],
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
    tags: ['activities']
  }),
  async (c) => {
    const uid = getToken(c)
    const activity = await getUserActivity(c.env, uid)
    return c.json(activity)
  }
)

// ===== 訪問済み店舗 =====

routes.openapi(
  createRoute({
    method: 'get',
    path: '/me/stores',
    request: {
      query: StoresQuerySchema
    },
    middleware: [verifyToken],
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
    tags: ['activities']
  }),
  async (c) => {
    const uid = getToken(c)
    const { status } = c.req.valid('query')
    const stores = await getUserStores(c.env, uid, status)
    return c.json({ stores })
  }
)

routes.openapi(
  createRoute({
    method: 'put',
    path: '/me/stores/:storeKey',
    middleware: [verifyToken],
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
            schema: UpdateStoreResponseSchema
          }
        },
        description: '店舗ステータス更新成功'
      }
    },
    tags: ['activities']
  }),
  async (c) => {
    const uid = getToken(c)
    const { storeKey } = c.req.valid('param')
    const { status } = c.req.valid('json')
    await updateUserStore(c.env, uid, storeKey, status)

    // バッジ評価は waitUntil でバックグラウンド実行、レスポンスは即返す
    if (status === 'visited') {
      c.executionCtx.waitUntil(
        evaluateOnVisit({ env: c.env, prisma: getPrisma(c.env), userId: uid }, storeKey as StoreKey).then((badges) =>
          pushEarnedBadges(c.env, uid, badges)
        )
      )
    }

    return c.json({ success: true, newBadges: [] })
  }
)

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/me/stores/:storeKey',
    middleware: [verifyToken],
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
    tags: ['activities']
  }),
  async (c) => {
    const uid = getToken(c)
    const { storeKey } = c.req.valid('param')
    await deleteUserStore(c.env, uid, storeKey)
    return c.json({ success: true })
  }
)

// ===== イベント（統合） =====

routes.openapi(
  createRoute({
    method: 'get',
    path: '/me/events',
    middleware: [verifyToken],
    request: {
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
    tags: ['activities']
  }),
  async (c) => {
    const uid = getToken(c)
    const { status } = c.req.valid('query')
    const events = await getUserEvents(c.env, uid, status)
    return c.json({ events })
  }
)

routes.openapi(
  createRoute({
    method: 'put',
    path: '/me/events/:eventId',
    middleware: [verifyToken],
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
            schema: UpdateEventResponseSchema
          }
        },
        description: 'イベントステータス更新成功'
      }
    },
    tags: ['activities']
  }),
  async (c) => {
    const uid = getToken(c)
    const { eventId } = c.req.valid('param')
    const { status } = c.req.valid('json')

    // 開催前イベントの達成登録を禁止
    if (status === 'completed') {
      const event = await getEvent(c.env, eventId)
      if (event.status === 'upcoming') {
        throw new HTTPException(400, { message: 'Cannot mark upcoming event as completed' })
      }
    }

    await updateUserEvent(c.env, uid, eventId, status)

    // バッジ評価は waitUntil でバックグラウンド実行、レスポンスは即返す
    if (status === 'completed') {
      c.executionCtx.waitUntil(
        evaluateOnEventComplete({ env: c.env, prisma: getPrisma(c.env), userId: uid }, eventId).then((badges) =>
          pushEarnedBadges(c.env, uid, badges)
        )
      )
    }

    return c.json({ success: true, newBadges: [] })
  }
)

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/me/events/:eventId',
    middleware: [verifyToken],
    request: {
      params: EventIdParamSchema,
      query: EventDeleteQuerySchema
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
    tags: ['activities']
  }),
  async (c) => {
    const uid = getToken(c)
    const { eventId } = c.req.valid('param')
    const { status } = c.req.valid('query')
    await deleteUserEvent(c.env, uid, eventId, status)
    return c.json({ success: true })
  }
)

// ===== WebSocket: バッジ獲得などの push 通知 =====
//
// OpenAPI スキーマには載せない素の Hono ルート。 verifyToken は Cookie の
// session JWT を見るので、 ブラウザの `new WebSocket(...)` が同一オリジンで
// 送る Cookie がそのまま使える。 UserPushDO に upgrade request を委譲する。
routes.get('/me/ws', verifyToken, async (c) => {
  const uid = getToken(c)
  const upgrade = c.req.header('Upgrade')
  console.info('WS headers:', Object.fromEntries(c.req.raw.headers), 'upgrade:', upgrade)
  if (upgrade?.toLowerCase() !== 'websocket') {
    throw new HTTPException(426, { message: 'Expected Upgrade: websocket' })
  }
  const stub = c.env.USER_PUSH.get(c.env.USER_PUSH.idFromName(uid))
  return stub.fetch(c.req.raw)
})

export default routes
