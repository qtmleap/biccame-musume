import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { BadgeLeaderboardResponseSchema, GetBadgesResponseSchema, MyBadgesResponseSchema } from '@/schemas/badge.dto'

export const badgesEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/badges',
    alias: 'getBadges',
    description: '全バッジ定義を取得（認証不要、未取得バッジはマスク）',
    response: GetBadgesResponseSchema
  },
  {
    method: 'get',
    path: '/api/users/me/badges',
    alias: 'getMyBadges',
    description: '自分の獲得バッジ一覧を取得',
    response: MyBadgesResponseSchema
  },
  {
    method: 'get',
    path: '/api/badges/leaderboard',
    alias: 'getBadgeLeaderboard',
    description: 'バッジリーダーボードを取得',
    parameters: [
      {
        name: 'uid',
        type: 'Query',
        schema: z.string().optional()
      }
    ],
    response: BadgeLeaderboardResponseSchema
  }
])
