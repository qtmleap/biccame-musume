import { makeApi } from '@zodios/core'
import { z } from 'zod'
import {
  BulkVoteRequestSchema,
  BulkVoteResponseSchemaForClient,
  VoteCountListSchema,
  VoteResponseSchema
} from '@/schemas/vote.dto'

export const votesEndpoints = makeApi([
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
  {
    method: 'post',
    path: '/api/votes/bulk',
    alias: 'createBulkVote',
    description: '一括投票（推し or 全員）',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: BulkVoteRequestSchema
      }
    ],
    response: BulkVoteResponseSchemaForClient
  }
])
