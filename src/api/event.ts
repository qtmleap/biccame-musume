import { type RateLimitBinding, type RateLimitKeyFunc, rateLimit } from '@elithrar/workers-hono-rate-limit'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { cloudflareAccessMiddleware } from '@/middleware/cloudflare-access'
import {
  type AckeyCampaign,
  AckeyCampaignSchema,
  CreateAckeyCampaignRequestSchema,
  type ReferenceUrl,
  UpdateAckeyCampaignRequestSchema
} from '../schemas/ackey-campaign.dto'

type Bindings = {
  BICCAME_MUSUME_EVENTS: KVNamespace
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
            events: z.array(AckeyCampaignSchema)
          })
        }
      },
      description: 'イベント一覧取得成功'
    }
  },
  tags: ['events']
})

routes.openapi(listEventsRoute, async (c) => {
  const events = await c.env.BICCAME_MUSUME_EVENTS.get('events:list')
  const eventList = events ? JSON.parse(events) : []

  return c.json({ events: eventList })
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
          schema: CreateAckeyCampaignRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: AckeyCampaignSchema
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
  const result = CreateAckeyCampaignRequestSchema.safeParse(body)
  if (!result.success) {
    throw new HTTPException(400, { message: result.error.message })
  }

  // 新しいイベントを作成
  const now = new Date().toISOString()
  const nowDate = new Date()

  // isEndedを自動計算
  const isEnded = !!result.data.actualEndDate || (!!result.data.endDate && new Date(result.data.endDate) < nowDate)

  const newEvent = {
    id: crypto.randomUUID(),
    ...result.data,
    startDate: result.data.startDate || now,
    isEnded,
    createdAt: now,
    updatedAt: now
  }

  // 既存のイベント一覧を取得
  const eventsData = await c.env.BICCAME_MUSUME_EVENTS.get('events:list')
  const events = eventsData ? JSON.parse(eventsData) : []

  // 新しいイベントを追加
  events.push(newEvent)

  // KVに保存
  await c.env.BICCAME_MUSUME_EVENTS.put('events:list', JSON.stringify(events))

  return c.json(newEvent, 201)
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
            event: AckeyCampaignSchema.optional()
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

  const eventsData = await c.env.BICCAME_MUSUME_EVENTS.get('events:list')
  const events: AckeyCampaign[] = eventsData ? JSON.parse(eventsData) : []

  // URLが一致するイベントを検索（自分自身は除外）
  const matchingEvent = events.find((event) => {
    if (excludeId && event.id === excludeId) return false
    return event.referenceUrls?.some((ref: ReferenceUrl) => ref.url === url)
  })

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
          schema: AckeyCampaignSchema
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

  const eventsData = await c.env.BICCAME_MUSUME_EVENTS.get('events:list')
  const events = eventsData ? JSON.parse(eventsData) : []

  const event = events.find((e: { id: string }) => e.id === id)
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
          schema: UpdateAckeyCampaignRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AckeyCampaignSchema
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

  const eventsData = await c.env.BICCAME_MUSUME_EVENTS.get('events:list')
  const events = eventsData ? JSON.parse(eventsData) : []

  const eventIndex = events.findIndex((e: { id: string }) => e.id === id)
  if (eventIndex === -1) {
    throw new HTTPException(404, { message: 'Event not found' })
  }

  // イベントを更新
  const updatedEvent = {
    ...events[eventIndex],
    ...body,
    updatedAt: new Date().toISOString()
  }

  // bodyにendDateが含まれていない場合は削除
  if (!('endDate' in body)) {
    delete updatedEvent.endDate
  }

  // bodyにactualEndDateが含まれていない場合は削除
  if (!('actualEndDate' in body)) {
    delete updatedEvent.actualEndDate
  }

  // isEndedを自動計算: actualEndDateがあるか、endDateが現在より過去なら終了
  const now = new Date()
  updatedEvent.isEnded =
    !!updatedEvent.actualEndDate || (!!updatedEvent.endDate && new Date(updatedEvent.endDate) < now)

  events[eventIndex] = updatedEvent

  // KVに保存
  await c.env.BICCAME_MUSUME_EVENTS.put('events:list', JSON.stringify(events))

  return c.json(updatedEvent)
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

  const eventsData = await c.env.BICCAME_MUSUME_EVENTS.get('events:list')
  const events = eventsData ? JSON.parse(eventsData) : []

  const eventIndex = events.findIndex((e: { id: string }) => e.id === id)
  if (eventIndex === -1) {
    throw new HTTPException(404, { message: 'Event not found' })
  }

  // イベントを削除
  events.splice(eventIndex, 1)

  // KVに保存
  await c.env.BICCAME_MUSUME_EVENTS.put('events:list', JSON.stringify(events))

  return c.body(null, 204)
})

export default routes
