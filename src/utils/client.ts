import { makeApi, Zodios } from '@zodios/core'
import { z } from 'zod'
import { EventRequestSchema, EventSchema } from '@/schemas/event.dto'
import { PageViewStatsSchema } from '@/schemas/stats.dto'
import { StoresSchema } from '@/schemas/store.dto'
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
        schema: z.string().nonempty()
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
    response: z.object({ success: z.boolean() })
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
        schema: z.string()
      },
      {
        name: 'excludeId',
        type: 'Query',
        schema: z.string().optional()
      }
    ],
    response: z.object({
      exists: z.boolean(),
      event: EventSchema.optional()
    })
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
        schema: z.string().optional()
      }
    ],
    response: PageViewStatsSchema
  },
  {
    method: 'post',
    path: '/api/stats/track',
    alias: 'trackPageView',
    description: 'ページビューを記録',
    parameters: [
      {
        name: 'path',
        type: 'Query',
        schema: z.string().optional()
      }
    ],
    response: PageViewStatsSchema
  },
  // ユーザー関連API
  {
    method: 'get',
    path: '/api/users/:id',
    alias: 'getUser',
    description: 'ユーザー情報を取得',
    response: z.object({
      id: z.string(),
      displayName: z.string().nullable(),
      photoUrl: z.string().nullable(),
      twitterUsername: z.string().nullable(),
      email: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string()
    })
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
        schema: z.object({
          id: z.string(),
          displayName: z.string().nullable().optional(),
          photoUrl: z.string().nullable().optional(),
          twitterUsername: z.string().nullable().optional(),
          email: z.string().nullable().optional()
        })
      }
    ],
    response: z.object({
      id: z.string(),
      displayName: z.string().nullable(),
      photoUrl: z.string().nullable(),
      twitterUsername: z.string().nullable(),
      email: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string()
    })
  },
  // ユーザーアクティビティ関連API
  {
    method: 'get',
    path: '/api/user-activity/:userId',
    alias: 'getUserActivity',
    description: 'ユーザーのアクティビティ全体を取得',
    response: z.object({
      visitedStores: z.array(z.string()),
      interestedEvents: z.array(z.string()),
      completedEvents: z.array(z.string())
    })
  },
  {
    method: 'get',
    path: '/api/user-activity/:userId/stores',
    alias: 'getVisitedStores',
    description: '訪問済み店舗一覧を取得',
    response: z.object({
      stores: z.array(z.string())
    })
  },
  {
    method: 'post',
    path: '/api/user-activity/:userId/stores/:storeKey',
    alias: 'addVisitedStore',
    description: '店舗を訪問済みに追加',
    response: z.object({ success: z.boolean() })
  },
  {
    method: 'delete',
    path: '/api/user-activity/:userId/stores/:storeKey',
    alias: 'removeVisitedStore',
    description: '店舗を訪問済みから削除',
    response: z.object({ success: z.boolean() })
  },
  {
    method: 'get',
    path: '/api/user-activity/:userId/interested',
    alias: 'getInterestedEvents',
    description: '興味のあるイベント一覧を取得',
    response: z.object({
      events: z.array(z.string())
    })
  },
  {
    method: 'post',
    path: '/api/user-activity/:userId/interested/:eventId',
    alias: 'addInterestedEvent',
    description: 'イベントを興味ありに追加',
    response: z.object({ success: z.boolean() })
  },
  {
    method: 'delete',
    path: '/api/user-activity/:userId/interested/:eventId',
    alias: 'removeInterestedEvent',
    description: 'イベントを興味ありから削除',
    response: z.object({ success: z.boolean() })
  },
  {
    method: 'get',
    path: '/api/user-activity/:userId/completed',
    alias: 'getCompletedEvents',
    description: '達成済みイベント一覧を取得',
    response: z.object({
      events: z.array(z.string())
    })
  },
  {
    method: 'post',
    path: '/api/user-activity/:userId/completed/:eventId',
    alias: 'addCompletedEvent',
    description: 'イベントを達成済みに追加',
    response: z.object({ success: z.boolean() })
  },
  {
    method: 'delete',
    path: '/api/user-activity/:userId/completed/:eventId',
    alias: 'removeCompletedEvent',
    description: 'イベントを達成済みから削除',
    response: z.object({ success: z.boolean() })
  }
])

/**
 * Zodiosクライアント
 */
export const client = new Zodios('/', api)
