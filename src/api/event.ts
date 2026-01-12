import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { cloudflareAccessMiddleware } from '@/middleware/cloudflare-access'
import * as eventService from '@/services/event.service'
import type { Bindings } from '@/types/bindings'
import { EventRequestSchema, EventSchema } from '../schemas/event.dto'

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
    // const prisma = new PrismaClient({ adapter: new PrismaD1(c.env.DB) })
    const events = await c.env.PRISMA.event.findMany({
      include: {
        conditions: true,
        referenceUrls: true,
        stores: true
      },
      orderBy: { startDate: 'desc' }
    })
    const result = EventSchema.array().safeParse(events)
    if (!result.success) {
      // console.error(JSON.stringify(events, null, 2))
      console.error(result.error)
      throw new HTTPException(400, { message: result.error.message })
    }
    return c.json(result.data)
  }
)

routes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    middleware: [cloudflareAccessMiddleware],
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

    // バリデーション
    const result = EventRequestSchema.safeParse(body)
    if (!result.success) {
      throw new HTTPException(400, { message: result.error.message })
    }

    const event = await eventService.createEvent(c.env.PRISMA, result.data)

    return c.json(event, 201)
  }
)

routes.openapi(
  createRoute({
    method: 'put',
    path: '/:id',
    middleware: [cloudflareAccessMiddleware],
    request: {
      params: z.object({
        id: z.string()
      }),
      body: {
        content: {
          'application/json': {
            schema: EventRequestSchema.partial()
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
    const body = c.req.valid('json')

    console.log('[API] Update event request:', { id, body: JSON.stringify(body, null, 2) })

    const event = await eventService.updateEvent(c.env.PRISMA, id, body)

    if (!event) {
      console.error('[API] Event not found for update:', id)
      throw new HTTPException(404, { message: 'Event not found' })
    }

    console.log('[API] Event updated successfully:', { id, eventName: event.name })
    return c.json(event, 200)
  }
)

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/:id',
    middleware: [cloudflareAccessMiddleware],
    request: {
      params: z.object({
        id: z.string()
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

    const deleted = await eventService.deleteEvent(c.env.PRISMA, id)

    if (!deleted) {
      throw new HTTPException(404, { message: 'Event not found' })
    }

    return c.body(null, 204)
  }
)

export default routes
