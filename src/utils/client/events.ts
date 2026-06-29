import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { SuccessResponseSchemaForClient } from '@/schemas/activity.dto'
import {
  CheckUrlResponseSchema,
  EventDetailSchema,
  EventRequestSchema,
  EventSchema,
  EventStatsRequestSchema,
  EventStatsResponseSchema
} from '@/schemas/event.dto'

export const eventsEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/events',
    alias: 'getEvents',
    description: 'イベント一覧を取得',
    response: z.array(EventSchema)
  },
  {
    method: 'get',
    path: '/api/events/:id',
    alias: 'getEvent',
    description: '単一イベントを取得',
    response: EventDetailSchema
  },
  {
    method: 'post',
    path: '/api/events',
    alias: 'createEvent',
    description: 'イベントを作成',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: EventRequestSchema
      }
    ],
    response: EventDetailSchema
  },
  {
    method: 'put',
    path: '/api/events/:id',
    alias: 'updateEvent',
    description: 'イベントを更新',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: EventRequestSchema.partial()
      }
    ],
    response: EventDetailSchema
  },
  {
    method: 'delete',
    path: '/api/events/:id',
    alias: 'deleteEvent',
    description: 'イベントを削除',
    response: SuccessResponseSchemaForClient
  },
  {
    method: 'post',
    path: '/api/events/stats',
    alias: 'getEventsStats',
    description: '複数イベントの興味あり・達成カウントを取得',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: EventStatsRequestSchema
      }
    ],
    response: EventStatsResponseSchema
  },
  {
    method: 'get',
    path: '/api/events/check-url',
    alias: 'checkDuplicateUrl',
    description: 'URLの重複をチェック',
    parameters: [
      {
        name: 'url',
        type: 'Query',
        schema: z.string().nonempty()
      },
      {
        name: 'excludeId',
        type: 'Query',
        schema: z.string().nonempty().optional()
      }
    ],
    response: CheckUrlResponseSchema
  }
])
