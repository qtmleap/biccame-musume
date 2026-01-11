import { type RateLimitBinding, type RateLimitKeyFunc, rateLimit } from '@elithrar/workers-hono-rate-limit'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { cloudflareAccessMiddleware } from '@/middleware/cloudflare-access'
import { EventRequestSchema, EventSchema } from '../schemas/event.dto'
import * as eventService from '@/services/event.service'

type Bindings = {
  DB: D1Database
  RATE_LIMITER: RateLimitBinding
}

const getKey: RateLimitKeyFunc = (c: Context): string => {
  return c.req.header('Authorization') || c.req.header('CF-Connecting-IP') || ''
}

const rateLimiter = async (c: Context, next: Next) => {
  return await rateLimit(c.env.RATE_LIMITER, getKey)(c, next)
}

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

routes.use('*', rateLimiter)

// イベント一覧取得
const listEventsRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            events: z.array(EventSchema)
          })
        }
      },
      description: 'イベント一覧取得成功'
    }
  },
  tags: ['events']
})

routes.openapi(listEventsRoute, async (c) => {
  const prisma = eventService.createPrismaClient(c.env.DB)
  const events = await eventService.listEvents(prisma)

  return c.json({ events })
})

// イベント作成
const createEventRoute = createRoute({
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
})

routes.openapi(createEventRoute, async (c) => {
  const body = c.req.valid('json')

  // バリデーション
  const result = EventRequestSchema.safeParse(body)
  if (!result.success) {
    throw new HTTPException(400, { message: result.error.message })
  }

  const prisma = eventService.createPrismaClient(c.env.DB)
  const event = await eventService.createEvent(prisma, result.data)

  return c.json(event, 201)
})

// URL重複チェック（/:id より前に定義する必要がある）
const checkDuplicateUrlRoute = createRoute({
  method: 'get',
  path: '/check-url',
  request: {
    query: z.object({
      url: z.string(),
      excludeId: z.string().optional()
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            exists: z.boolean(),
            event: EventSchema.optional()
          })
        }
      },
      description: 'URL重複チェック結果'
    }
  },
  tags: ['events']
})

routes.openapi(checkDuplicateUrlRoute, async (c) => {
  const { url, excludeId } = c.req.valid('query')

  const prisma = eventService.createPrismaClient(c.env.DB)
  const matchingEvent = await eventService.findEventByUrl(prisma, url, excludeId)

  return c.json({
    exists: !!matchingEvent,
    event: matchingEvent
  })
})

// イベント取得
const getEventRoute = createRoute({
  method: 'get',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: EventSchema
        }
      },
      description: 'イベント取得成功'
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
})

routes.openapi(getEventRoute, async (c) => {
  const { id } = c.req.valid('param')

  const prisma = eventService.createPrismaClient(c.env.DB)
  const event = await eventService.getEventById(prisma, id)

  if (!event) {
    throw new HTTPException(404, { message: 'Event not found' })
  }

  return c.json(event)
})

// イベント更新
const updateEventRoute = createRoute({
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
})

routes.openapi(updateEventRoute, async (c) => {
  const { id } = c.req.valid('param')
  const body = c.req.valid('json')

  const prisma = eventService.createPrismaClient(c.env.DB)
  const event = await eventService.updateEvent(prisma, id, body)

  if (!event) {
    throw new HTTPException(404, { message: 'Event not found' })
  }

  return c.json(event, 200)
})

// イベント削除
const deleteEventRoute = createRoute({
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
})

routes.openapi(deleteEventRoute, async (c) => {
  const { id } = c.req.valid('param')

  const prisma = eventService.createPrismaClient(c.env.DB)
  const deleted = await eventService.deleteEvent(prisma, id)

  if (!deleted) {
    throw new HTTPException(404, { message: 'Event not found' })
  }

  return c.body(null, 204)
})

export default routes
