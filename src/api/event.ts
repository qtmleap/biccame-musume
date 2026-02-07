import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { CFAuth } from '@/middleware/cloudflare-access'
import { createEvent, deleteEvent, getEvent, getEvents, updateEvent } from '@/services/event.service'
import { getEventStats, getEventsStats } from '@/services/user-activity.service'
import type { Bindings } from '@/types/bindings'
import { type EventRequest, EventRequestSchema, EventSchema } from '../schemas/event.dto'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.array(EventSchema)
          }
        },
        description: 'イベント一覧取得成功'
      }
    },
    tags: ['events']
  }),
  async (c) => {
    return c.json(await getEvents(c.env))
  }
)

routes.openapi(
  createRoute({
    method: 'get',
    path: '/:id',
    request: {
      params: z.object({
        id: z.string().nonempty()
      })
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: EventSchema
          }
        },
        description: 'イベント一覧取得成功'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        },
        description: 'バリデーションエラー'
      }
    },
    tags: ['events']
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await getEvent(c.env, id), 200)
  }
)

routes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    middleware: [CFAuth],
    request: {
      body: {
        content: {
          'application/json': {
            schema: EventRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        content: {
          'application/json': {
            schema: EventSchema
          }
        },
        description: 'イベント作成成功'
      },
      400: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        },
        description: 'バリデーションエラー'
      }
    },
    tags: ['events']
  }),
  async (c) => {
    const body = c.req.valid('json')
    return c.json(await createEvent(c.env, body), 201)
  }
)

routes.openapi(
  createRoute({
    method: 'put',
    path: '/:id',
    middleware: [CFAuth],
    request: {
      params: z.object({
        id: z.string().nonempty()
      }),
      body: {
        content: {
          'application/json': {
            schema: EventRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: EventSchema
          }
        },
        description: 'イベント更新成功'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        },
        description: 'イベントが見つかりません'
      }
    },
    tags: ['events']
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json') as EventRequest
    return c.json(await updateEvent(c.env, { ...body, uuid: id }), 200)
  }
)

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/:id',
    middleware: [CFAuth],
    request: {
      params: z.object({
        id: z.string().nonempty()
      })
    },
    responses: {
      204: {
        description: 'イベント削除成功'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        },
        description: 'イベントが見つかりません'
      }
    },
    tags: ['events']
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    return c.body(await deleteEvent(c.env, id), 204)
  }
)

// イベント統計API（興味あり・達成カウント）

routes.openapi(
  createRoute({
    method: 'get',
    path: '/:id/stats',
    request: {
      params: z.object({
        id: z.string().nonempty()
      })
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              interestedCount: z.number(),
              completedCount: z.number()
            })
          }
        },
        description: 'イベント統計取得成功'
      }
    },
    tags: ['events']
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const stats = await getEventStats(c.env, id)
    return c.json(stats)
  }
)

routes.openapi(
  createRoute({
    method: 'post',
    path: '/stats',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              eventIds: z.array(z.string())
            })
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.record(
              z.string(),
              z.object({
                interestedCount: z.number(),
                completedCount: z.number()
              })
            )
          }
        },
        description: '複数イベント統計取得成功'
      }
    },
    tags: ['events']
  }),
  async (c) => {
    const { eventIds } = c.req.valid('json')
    const stats = await getEventsStats(c.env, eventIds)
    return c.json(stats)
  }
)

export default routes
