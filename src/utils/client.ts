import { makeApi, Zodios } from '@zodios/core'
import { z } from 'zod'
import { EventRequestSchema, EventSchema } from '@/schemas/event.dto'
import { StoresSchema } from '@/schemas/store.dto'
import { AllVoteCountsSchema, VoteCountSchema, VoteRequestSchema, VoteSuccessResponseSchema } from '@/schemas/vote.dto'

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
    alias: 'getAllVoteCounts',
    description: '全キャラクターの投票数を取得',
    response: AllVoteCountsSchema,
    parameters: [
      {
        name: 'year',
        type: 'Query',
        schema: z.string().optional()
      }
    ]
  },
  {
    method: 'get',
    path: '/api/votes/:characterId',
    alias: 'getVoteCount',
    description: 'キャラクターの投票数を取得',
    response: VoteCountSchema
  },
  {
    method: 'post',
    path: '/api/votes',
    alias: 'submitVote',
    description: '投票を送信',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: VoteRequestSchema
      }
    ],
    response: VoteSuccessResponseSchema
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
  }
])

/**
 * Zodiosクライアント
 */
export const client = new Zodios('/', api)
