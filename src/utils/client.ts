import { makeApi, Zodios } from '@zodios/core'
import { z } from 'zod'
import { CharactersSchema } from '@/schemas/character.dto'
import { CreateEventRequestSchema, EventSchema, UpdateEventRequestSchema } from '@/schemas/event.dto'
import { AllVoteCountsSchema, VoteCountSchema, VoteRequestSchema, VoteSuccessResponseSchema } from '@/schemas/vote.dto'

/**
 * イベント一覧レスポンス
 */
const EventsResponseSchema = z.object({
  events: z.array(EventSchema)
})

/**
 * URL重複チェックレスポンス
 */
const CheckDuplicateUrlResponseSchema = z.object({
  exists: z.boolean(),
  event: EventSchema.optional()
})

/**
 * API定義
 */
const api = makeApi([
  {
    method: 'get',
    path: '/characters.json',
    alias: 'getCharacters',
    description: 'ビッカメ娘キャラクター一覧を取得',
    response: CharactersSchema
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
    response: EventsResponseSchema
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
        schema: CreateEventRequestSchema
      }
    ],
    response: EventSchema
  },
  {
    method: 'put',
    path: '/api/events/:eventId',
    alias: 'updateEvent',
    description: 'イベントを更新',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateEventRequestSchema
      }
    ],
    response: EventSchema
  },
  {
    method: 'delete',
    path: '/api/events/:eventId',
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
    response: CheckDuplicateUrlResponseSchema
  }
])

/**
 * Zodiosクライアント
 */
export const client = new Zodios('/', api)
