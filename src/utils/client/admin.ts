import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { AdminCommentsResponseSchema } from '@/schemas/admin-comment.dto'
import { AdminTwitterStatusResponseSchema } from '@/schemas/admin-twitter.dto'
import {
  BadgeMutationResponseSchema,
  CreateSpecialBadgeBodySchema,
  GetBadgesResponseSchema,
  UpdateBadgeBodySchema
} from '@/schemas/badge.dto'
import { AdminUserListResponseSchemaForClient } from '@/schemas/user.dto'

/**
 * 管理者向け API のエンドポイント定義 (badges / comments / users / twitter)
 */
export const adminEndpoints = makeApi([
  // 管理者バッジCRUD
  {
    method: 'get',
    path: '/api/admin/badges',
    alias: 'getAllBadgesAdmin',
    description: '全バッジ定義を取得（admin、隠しバッジ + 獲得者数を含む）',
    response: GetBadgesResponseSchema
  },
  {
    method: 'post',
    path: '/api/admin/badges',
    alias: 'createSpecialBadge',
    description: 'special バッジを作成（admin）',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateSpecialBadgeBodySchema
      }
    ],
    response: BadgeMutationResponseSchema
  },
  {
    method: 'patch',
    path: '/api/admin/badges/:code',
    alias: 'updateBadge',
    description: 'バッジを更新（admin）',
    parameters: [
      {
        name: 'code',
        type: 'Path',
        schema: z.string().nonempty()
      },
      {
        name: 'body',
        type: 'Body',
        schema: UpdateBadgeBodySchema
      }
    ],
    response: BadgeMutationResponseSchema
  },
  {
    method: 'delete',
    path: '/api/admin/badges/:code',
    alias: 'deleteBadge',
    description: 'special バッジを削除（admin）',
    parameters: [
      {
        name: 'code',
        type: 'Path',
        schema: z.string().nonempty()
      }
    ],
    response: z.void()
  },
  {
    method: 'post',
    path: '/api/admin/badges/recalculate',
    alias: 'recalculateBadges',
    description: '全ユーザーのバッジ獲得状況を再評価（admin）',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({}).optional()
      }
    ],
    response: z.object({
      processedUsers: z.number(),
      scheduled: z.literal(true)
    })
  },
  // 管理者コメント一覧
  {
    method: 'get',
    path: '/api/admin/comments',
    alias: 'getAdminComments',
    description: '全コメント一覧を取得（admin）',
    parameters: [
      {
        name: 'includeDeleted',
        type: 'Query',
        schema: z.union([z.literal('1'), z.literal('0')]).optional()
      }
    ],
    response: AdminCommentsResponseSchema
  },
  // 管理者ユーザー一覧
  {
    method: 'get',
    path: '/api/admin/users',
    alias: 'getAdminUsers',
    description: '全ユーザー一覧を取得（admin）',
    response: AdminUserListResponseSchemaForClient
  },
  // 管理者: 投稿用 X アカウントのヘルスチェック
  {
    method: 'get',
    path: '/api/admin/twitter/status',
    alias: 'getAdminTwitterStatus',
    description: '投稿用 X アカウントの取得結果（admin）',
    response: AdminTwitterStatusResponseSchema
  }
])
