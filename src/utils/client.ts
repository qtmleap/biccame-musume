import { makeApi, Zodios } from '@zodios/core'
import { CharactersSchema } from '@/schemas/character.dto'
import { AllVoteCountsSchema, VoteCountSchema, VoteRequestSchema, VoteResponseSchema } from '@/schemas/vote.dto'

/**
 * キャラクターAPI定義
 */
const characterApi = makeApi([
  {
    method: 'get',
    path: '/characters.json',
    alias: 'getCharacters',
    description: 'ビッカメ娘キャラクター一覧を取得',
    response: CharactersSchema
  }
])

/**
 * 投票API定義
 */
const voteApi = makeApi([
  {
    method: 'get',
    path: '/api/votes',
    alias: 'getAllVoteCounts',
    description: '全キャラクターの投票数を取得',
    response: AllVoteCountsSchema
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
 */
export const client = new Zodios('/', characterApi)
export const voteClient = new Zodios('/', voteApi)
