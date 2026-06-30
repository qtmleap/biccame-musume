import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { EventGroupDetailSchema, EventGroupRequestSchema, EventGroupSchema } from '@/schemas/event-group.dto'
import {
  createEventGroup,
  deleteEventGroup,
  getEventGroupById,
  getEventGroups,
  updateEventGroup
} from '@/services/event-group-service'
import type { Bindings } from '@/types/bindings'

/**
 * 管理者向けイベントグループ API。
 * 認証は src/api/admin/index.ts で /admin/* 全体に CFAuth を適用しているため
 * 個別ルートでは middleware: [CFAuth] を指定しない。
 */
const routes = new OpenAPIHono<{ Bindings: Bindings }>()

routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/event-groups',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.array(EventGroupSchema)
          }
        },
        description: 'イベントグループ一覧取得成功'
      }
    },
    tags: ['admin-event-groups']
  }),
  async (c) => {
    return c.json(await getEventGroups(c.env))
  }
)

routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/event-groups/:id',
    request: {
      params: z.object({
        id: z.string().nonempty()
      })
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: EventGroupDetailSchema
          }
        },
        description: 'イベントグループ詳細取得成功'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().nonempty()
            })
          }
        },
        description: 'グループが見つかりません'
      }
    },
    tags: ['admin-event-groups']
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await getEventGroupById(c.env, id), 200)
  }
)

routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/event-groups',
    request: {
      body: {
        content: {
          'application/json': {
            schema: EventGroupRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        content: {
          'application/json': {
            schema: EventGroupSchema
          }
        },
        description: 'イベントグループ作成成功'
      },
      400: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().nonempty()
            })
          }
        },
        description: 'バリデーションエラー'
      }
    },
    tags: ['admin-event-groups']
  }),
  async (c) => {
    const body = c.req.valid('json')
    const group = await createEventGroup(c.env, body)
    return c.json(group, 201)
  }
)

routes.openapi(
  createRoute({
    method: 'put',
    path: '/admin/event-groups/:id',
    request: {
      params: z.object({
        id: z.string().nonempty()
      }),
      body: {
        content: {
          'application/json': {
            schema: EventGroupRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: EventGroupSchema
          }
        },
        description: 'イベントグループ更新成功'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().nonempty()
            })
          }
        },
        description: 'グループが見つかりません'
      }
    },
    tags: ['admin-event-groups']
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const group = await updateEventGroup(c.env, { ...body, uuid: id })
    return c.json(group, 200)
  }
)

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/admin/event-groups/:id',
    request: {
      params: z.object({
        id: z.string().nonempty()
      })
    },
    responses: {
      204: {
        description: 'イベントグループ削除成功'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().nonempty()
            })
          }
        },
        description: 'グループが見つかりません'
      }
    },
    tags: ['admin-event-groups']
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    return c.body(await deleteEventGroup(c.env, id), 204)
  }
)

export default routes
