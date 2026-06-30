import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { EventGroupDetailSchema, EventGroupRequestSchema, EventGroupSchema } from '@/schemas/event-group.dto'

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
    path: '/api/event-groups/:slug',
    alias: 'getEventGroup',
    description: 'イベントグループ詳細を slug から取得',
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
  }
])
