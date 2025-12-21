import { makeApi, Zodios } from '@zodios/core'
import { z } from 'zod'
import { CharactersSchema } from '@/schemas/character.dto'
import { AllVoteCountsSchema, VoteCountSchema, VoteRequestSchema, VoteResponseSchema } from '@/schemas/vote.dto'

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
    response: VoteResponseSchema
  }
])

/**
 * Zodiosクライアント
 * Next.jsではサーバーサイドで絶対URLが必要
 */
const baseURL =
  typeof window === 'undefined' ? process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000' : window.location.origin

export const client = new Zodios(baseURL, api)
