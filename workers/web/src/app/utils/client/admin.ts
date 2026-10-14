import { discordDeliveryResultSchema, discordTestRequestSchema } from '@biccame/shared/bot'
import {
  AdminBotConfigurationRequestSchema,
  AdminBotConfigurationResponseSchema,
  AdminBotStatusSchema
} from '@biccame/shared/schemas/admin-bot.dto'
import { AdminCommentsResponseSchema } from '@biccame/shared/schemas/admin-comment.dto'
import { AdminTwitterStatusResponseSchema } from '@biccame/shared/schemas/admin-twitter.dto'
import {
  AdminBadgeRankingResponseSchema,
  AdminUserBadgesResponseSchema,
  BadgeHoldersResponseSchema,
  BadgeMutationResponseSchema,
  CreateSpecialBadgeBodySchema,
  GetBadgesResponseSchema,
  UpdateBadgeBodySchema
} from '@biccame/shared/schemas/badge.dto'
import { AdminUserListResponseSchemaForClient } from '@biccame/shared/schemas/user.dto'
import {
  WebhookJobListSchema,
  WebhookJobOrderSchema,
  WebhookJobQuerySchema,
  WebhookJobRangeSchema,
  WebhookJobSchema,
  WebhookJobSortSchema,
  WebhookKeywordVerdictSchema,
  WebhookPostStatusFilterSchema,
  WebhookResolveSchema,
  WebhookRetrySchema
} from '@biccame/shared/schemas/webhook.dto'
import { makeApi } from '@zodios/core'
import { z } from 'zod'

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
    method: 'get',
    path: '/api/admin/badges/:code/holders',
    alias: 'getAdminBadgeHolders',
    description: '指定バッジの獲得者一覧を取得（admin、個人情報を含む）',
    parameters: [
      {
        name: 'code',
        type: 'Path',
        schema: z.string().nonempty()
      }
    ],
    response: BadgeHoldersResponseSchema
  },
  {
    method: 'get',
    path: '/api/admin/badges/leaderboard',
    alias: 'getAdminBadgeRanking',
    description: 'バッジ所持数ランキングを取得（admin、ページング対応）',
    parameters: [
      {
        name: 'limit',
        type: 'Query',
        schema: z.coerce.number().int().min(1).max(200).optional()
      },
      {
        name: 'offset',
        type: 'Query',
        schema: z.coerce.number().int().min(0).optional()
      }
    ],
    response: AdminBadgeRankingResponseSchema
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
  {
    method: 'get',
    path: '/api/admin/users/:uid/badges',
    alias: 'getAdminUserBadges',
    description: '特定ユーザーの獲得バッジ一覧を取得（admin、レアリティ→獲得日順）',
    parameters: [
      {
        name: 'uid',
        type: 'Path',
        schema: z.string().nonempty()
      }
    ],
    response: AdminUserBadgesResponseSchema
  },
  // 管理者: 投稿用 X アカウントのヘルスチェック
  {
    method: 'get',
    path: '/api/admin/twitter/status',
    alias: 'getAdminTwitterStatus',
    description: '投稿用 X アカウントの取得結果（admin）',
    response: AdminTwitterStatusResponseSchema
  },
  {
    method: 'get',
    path: '/api/admin/bot/status',
    alias: 'getAdminBotStatus',
    response: AdminBotStatusSchema
  },
  {
    method: 'post',
    path: '/api/admin/bot/configuration',
    alias: 'saveAdminBotConfiguration',
    parameters: [{ name: 'body', type: 'Body', schema: AdminBotConfigurationRequestSchema }],
    response: AdminBotConfigurationResponseSchema
  },
  {
    method: 'post',
    path: '/api/admin/bot/connection',
    alias: 'checkAdminBotConnection',
    response: AdminBotStatusSchema
  },
  {
    method: 'post',
    path: '/api/admin/bot/test',
    alias: 'testAdminBotNotification',
    parameters: [{ name: 'body', type: 'Body', schema: discordTestRequestSchema }],
    response: discordDeliveryResultSchema
  },
  {
    method: 'get',
    path: '/api/admin/webhook/jobs',
    alias: 'listAdminWebhookJobs',
    parameters: [
      { name: 'limit', type: 'Query', schema: z.number().int().min(1).max(100).optional() },
      { name: 'cursor', type: 'Query', schema: WebhookJobQuerySchema.shape.cursor },
      { name: 'range', type: 'Query', schema: WebhookJobRangeSchema.optional() },
      { name: 'sort', type: 'Query', schema: WebhookJobSortSchema.optional() },
      { name: 'order', type: 'Query', schema: WebhookJobOrderSchema.optional() },
      { name: 'verdict', type: 'Query', schema: WebhookKeywordVerdictSchema.optional() },
      { name: 'postStatus', type: 'Query', schema: WebhookPostStatusFilterSchema.optional() }
    ],
    response: WebhookJobListSchema
  },
  {
    method: 'get',
    path: '/api/admin/webhook/jobs/:postId',
    alias: 'getAdminWebhookJob',
    parameters: [{ name: 'postId', type: 'Path', schema: z.string().regex(/^\d{1,20}$/) }],
    response: WebhookJobSchema
  },
  {
    method: 'post',
    path: '/api/admin/webhook/jobs/:postId/retry',
    alias: 'retryAdminWebhookJob',
    parameters: [
      { name: 'postId', type: 'Path', schema: z.string().regex(/^\d{1,20}$/) },
      { name: 'body', type: 'Body', schema: WebhookRetrySchema }
    ],
    response: WebhookJobSchema
  },
  {
    method: 'post',
    path: '/api/admin/webhook/jobs/:postId/rejudge',
    alias: 'rejudgeAdminWebhookJob',
    parameters: [
      { name: 'postId', type: 'Path', schema: z.string().regex(/^\d{1,20}$/) },
      { name: 'candidateId', type: 'Query', schema: z.uuid().optional() }
    ],
    response: WebhookJobSchema
  },
  {
    method: 'post',
    path: '/api/admin/webhook/jobs/:postId/resolve',
    alias: 'resolveAdminWebhookJob',
    parameters: [
      { name: 'postId', type: 'Path', schema: z.string().regex(/^\d{1,20}$/) },
      { name: 'body', type: 'Body', schema: WebhookResolveSchema }
    ],
    response: WebhookJobSchema
  }
])
