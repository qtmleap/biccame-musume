import { makeApi } from '@zodios/core'
import { z } from 'zod'
import {
  SuccessResponseSchemaForClient,
  UpdateEventResponseSchema,
  UpdateEventStatusSchema,
  UpdateStoreResponseSchema,
  UpdateStoreStatusSchema,
  UserActivitiesResponseSchema,
  UserEventsResponseSchema,
  UserStoresResponseSchema
} from '@/schemas/activity.dto'

export const activitiesEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/me/activities',
    alias: 'getUserActivities',
    description: 'ユーザーのアクティビティ全体を取得',
    response: UserActivitiesResponseSchema
  },
  // 店舗関連
  {
    method: 'get',
    path: '/api/me/stores',
    alias: 'getUserStores',
    description: 'ユーザーの店舗一覧を取得',
    parameters: [
      {
        name: 'status',
        type: 'Query',
        schema: z.enum(['visited', 'favorite', 'want_to_visit']).optional()
      }
    ],
    response: UserStoresResponseSchema
  },
  {
    method: 'put',
    path: '/api/me/stores/:storeKey',
    alias: 'updateUserStore',
    description: '店舗のステータスを更新',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateStoreStatusSchema
      }
    ],
    response: UpdateStoreResponseSchema
  },
  {
    method: 'delete',
    path: '/api/me/stores/:storeKey',
    alias: 'deleteUserStore',
    description: '店舗を削除',
    response: SuccessResponseSchemaForClient
  },
  // イベント関連
  {
    method: 'get',
    path: '/api/me/events',
    alias: 'getUserEvents',
    description: 'ユーザーのイベント一覧を取得',
    parameters: [
      {
        name: 'status',
        type: 'Query',
        schema: z.enum(['interested', 'completed']).optional()
      }
    ],
    response: UserEventsResponseSchema
  },
  {
    method: 'put',
    path: '/api/me/events/:eventId',
    alias: 'updateUserEvent',
    description: 'イベントのステータスを更新',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateEventStatusSchema
      }
    ],
    response: UpdateEventResponseSchema
  },
  {
    method: 'delete',
    path: '/api/me/events/:eventId',
    alias: 'deleteUserEvent',
    description: 'イベントを削除',
    parameters: [
      {
        name: 'status',
        type: 'Query',
        schema: z.enum(['interested', 'completed'])
      }
    ],
    response: SuccessResponseSchemaForClient
  }
])
