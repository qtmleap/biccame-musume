import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { EventGroupDetailSchema, EventGroupRequestSchema, EventGroupSchema } from '@/schemas/event-group.dto'

const EventLinkBodySchema = z.object({ eventIds: z.array(z.string().nonempty()) })
const EventLinkResponseSchema = z.object({ updated: z.number().int().nonnegative() })

/**
 * イベントグループ API のエンドポイント定義（公開 + 管理）
 */
export const eventGroupsEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/event-groups',
    alias: 'getEventGroups',
    description: 'イベントグループ一覧を取得',
    response: z.array(EventGroupSchema)
  },
  {
    method: 'get',
    path: '/api/event-groups/:id',
    alias: 'getEventGroup',
    description: 'イベントグループ詳細を取得',
    response: EventGroupDetailSchema
  },
  {
    method: 'get',
    path: '/api/admin/event-groups',
    alias: 'getAdminEventGroups',
    description: 'イベントグループ一覧を取得（admin）',
    response: z.array(EventGroupSchema)
  },
  {
    method: 'get',
    path: '/api/admin/event-groups/:id',
    alias: 'getAdminEventGroup',
    description: 'イベントグループ詳細を取得（admin）',
    response: EventGroupDetailSchema
  },
  {
    method: 'post',
    path: '/api/admin/event-groups',
    alias: 'createEventGroup',
    description: 'イベントグループを作成（admin）',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: EventGroupRequestSchema
      }
    ],
    response: EventGroupSchema
  },
  {
    method: 'put',
    path: '/api/admin/event-groups/:id',
    alias: 'updateEventGroup',
    description: 'イベントグループを更新（admin）',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: EventGroupRequestSchema
      }
    ],
    response: EventGroupSchema
  },
  {
    method: 'delete',
    path: '/api/admin/event-groups/:id',
    alias: 'deleteEventGroup',
    description: 'イベントグループを削除（admin）',
    response: z.void()
  },
  {
    method: 'post',
    path: '/api/admin/event-groups/:id/events',
    alias: 'linkEventsToGroup',
    description: '指定 Event をグループに紐付ける（admin）',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: EventLinkBodySchema
      }
    ],
    response: EventLinkResponseSchema
  },
  {
    method: 'delete',
    path: '/api/admin/event-groups/:id/events',
    alias: 'unlinkEventsFromGroup',
    description: '指定 Event のグループ所属を解除（admin）',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: EventLinkBodySchema
      }
    ],
    response: EventLinkResponseSchema
  }
])
