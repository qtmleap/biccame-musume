import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  EventDeleteQuerySchema,
  EventIdParamSchema,
  EventsQuerySchema,
  EventsResponseSchema,
  StoreKeyParamSchema,
  StoresQuerySchema,
  StoresResponseSchema,
  SuccessResponseSchema,
  UpdateEventStatusSchema,
  UpdateStoreStatusSchema,
  UserActivityResponseSchema
} from '@/schemas/activity.dto'
import {
  deleteUserEvent,
  deleteUserStore,
  getUserActivity,
  getUserEvents,
  getUserStores,
  updateUserEvent,
  updateUserStore
} from '@/services/me.service'
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
            schema: SuccessResponseSchema
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
    return c.json({ success: true })
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
            schema: SuccessResponseSchema
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
    await updateUserEvent(c.env, uid, eventId, status)
    return c.json({ success: true })
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

export default routes
