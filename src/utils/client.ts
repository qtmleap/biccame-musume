import { makeApi, Zodios } from '@zodios/core'
import { z } from 'zod'
import {
  SuccessResponseSchemaForClient,
  UpdateEventStatusSchema,
  UpdateStoreStatusSchema,
  UserActivitiesResponseSchema,
  UserEventsResponseSchema,
  UserStoresResponseSchema
} from '@/schemas/activity.dto'
import { AuthResponseSchema, CurrentUserResponseSchema } from '@/schemas/auth.dto'
import {
  CheckUrlResponseSchema,
  EventRequestSchema,
  EventSchema,
  EventStatsRequestSchema,
  EventStatsResponseSchema
} from '@/schemas/event.dto'
import { PageViewStatsSchema } from '@/schemas/stats.dto'
import { StoresSchema } from '@/schemas/store.dto'
import { UpsertUserRequestSchemaForClient, UserResponseSchemaForClient } from '@/schemas/user.dto'
import { VoteCountListSchema, VoteResponseSchema } from '@/schemas/vote.dto'

/**
 * API定義
 */
const api = makeApi([
  {
    method: 'get',
    path: '/characters.json',
    alias: 'getCharacters',
    description: 'ビッカメ娘キャラクター一覧を取得',
    response: StoresSchema
  },
  {
    method: 'get',
    path: '/api/votes',
    alias: 'getVotes',
    description: '投票数取得',
    response: VoteCountListSchema
  },
  {
    method: 'post',
    path: '/api/votes/:characterId',
    alias: 'createVote',
    description: '投票',
    parameters: [
      {
        name: 'characterId',
        type: 'Path',
        schema: z.string().nonempty().nonempty()
      }
    ],
    response: VoteResponseSchema
  },
  // イベント関連API
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
    response: EventSchema
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
    response: EventSchema
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
    response: EventSchema
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
  },
  // ページビュー統計API
  {
    method: 'get',
    path: '/api/stats',
    alias: 'getPageViews',
    description: 'ページビュー統計を取得',
    parameters: [
      {
        name: 'path',
        type: 'Query',
        schema: z.string().nonempty().optional()
      }
    ],
    response: PageViewStatsSchema
  },
  // 認証関連API
  {
    method: 'post',
    path: '/api/auth',
    alias: 'authenticate',
    description: 'Firebase IDトークンで認証してセッションクッキーを設定',
    response: AuthResponseSchema
  },
  {
    method: 'post',
    path: '/api/auth/logout',
    alias: 'logout',
    description: 'ログアウトしてセッションクッキーを削除',
    response: AuthResponseSchema
  },
  // ユーザー関連API
  {
    method: 'get',
    path: '/api/me',
    alias: 'getCurrentUser',
    description: '現在ログイン中のユーザー情報を取得',
    response: CurrentUserResponseSchema
  },
  {
    method: 'get',
    path: '/api/users/:id',
    alias: 'getUser',
    description: 'ユーザー情報を取得',
    response: UserResponseSchemaForClient
  },
  {
    method: 'post',
    path: '/api/users',
    alias: 'upsertUser',
    description: 'ユーザーを作成/更新',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpsertUserRequestSchemaForClient
      }
    ],
    response: UserResponseSchemaForClient
  },
  // ユーザーアクティビティ関連API
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
    response: SuccessResponseSchemaForClient
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
    response: SuccessResponseSchemaForClient
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

/**
 * Zodiosクライアント
 */
export const client = new Zodios('/', api)
