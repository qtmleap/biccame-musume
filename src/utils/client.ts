import { makeApi, Zodios } from '@zodios/core'
import { z } from 'zod'
import {
  SuccessResponseSchemaForClient,
  UpdateEventResponseSchema,
  UpdateEventStatusSchema,
  UpdateStoreResponseSchema,
  UpdateStoreStatusSchema,
  UserActivitiesResponseSchema,
  UserEventsResponseSchema,
  UserStoresResponseSchema
} from '@/schemas/activity.dto'
import { AdminCommentsResponseSchema } from '@/schemas/admin-comment.dto'
import { AuthResponseSchema, CurrentUserResponseSchema } from '@/schemas/auth.dto'
import {
  BadgeSchema,
  CreateSpecialBadgeBodySchema,
  GetBadgeLeaderboardResponseSchema,
  GetBadgesResponseSchema,
  GetMyBadgesResponseSchema,
  UpdateBadgeBodySchema
} from '@/schemas/badge.dto'
import { CreateCommentRequestSchema, ListCommentsResponseSchema } from '@/schemas/comment.dto'
import {
  CheckUrlResponseSchema,
  EventDetailSchema,
  EventRequestSchema,
  EventSchema,
  EventStatsRequestSchema,
  EventStatsResponseSchema
} from '@/schemas/event.dto'
import { FavoriteCharactersResponseSchemaForClient } from '@/schemas/favorite.dto'
import { SearchResultSchema } from '@/schemas/search.dto'
import { PageViewStatsSchema } from '@/schemas/stats.dto'
import { StoresSchema } from '@/schemas/store.dto'
import { UserResponseSchemaForClient } from '@/schemas/user.dto'
import {
  BulkVoteRequestSchema,
  BulkVoteResponseSchemaForClient,
  VoteCountListSchema,
  VoteResponseSchema
} from '@/schemas/vote.dto'

/**
 * バージョン情報レスポンススキーマ
 */
export const VersionResponseSchema = z.object({
  version: z.string(),
  hash: z.string(),
  buildAt: z.string()
})

/**
 * API定義
 */
const api = makeApi([
  {
    method: 'get',
    path: '/api/version',
    alias: 'getVersion',
    description: 'アプリのバージョン情報を取得（認証不要）',
    response: VersionResponseSchema
  },
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
    response: EventDetailSchema
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
    response: EventDetailSchema
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
    response: EventDetailSchema
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
  // 検索API
  {
    method: 'get',
    path: '/api/search',
    alias: 'searchEvents',
    description: 'イベントをタイトルで全文検索',
    parameters: [
      {
        name: 'q',
        type: 'Query',
        schema: z.string().min(1).max(100)
      }
    ],
    response: SearchResultSchema
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
  // ページビュー記録API
  {
    method: 'post',
    path: '/api/stats',
    alias: 'trackPageView',
    description: 'ページビューを記録',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({ path: z.string().min(1) })
      }
    ],
    response: z.object({ success: z.boolean() })
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
    response: UpdateStoreResponseSchema
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
    response: UpdateEventResponseSchema
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
  },
  // お気に入りキャラクター関連API
  {
    method: 'get',
    path: '/api/me/favorites',
    alias: 'getFavoriteCharacters',
    description: 'お気に入りキャラクター一覧を取得',
    response: FavoriteCharactersResponseSchemaForClient
  },
  {
    method: 'post',
    path: '/api/me/favorites/:characterId',
    alias: 'addFavoriteCharacter',
    description: 'お気に入りキャラクターを追加',
    parameters: [
      {
        name: 'characterId',
        type: 'Path',
        schema: z.string().nonempty()
      }
    ],
    response: SuccessResponseSchemaForClient
  },
  {
    method: 'delete',
    path: '/api/me/favorites/:characterId',
    alias: 'removeFavoriteCharacter',
    description: 'お気に入りキャラクターを削除',
    parameters: [
      {
        name: 'characterId',
        type: 'Path',
        schema: z.string().nonempty()
      }
    ],
    response: SuccessResponseSchemaForClient
  },
  // バッジ関連API
  {
    method: 'get',
    path: '/api/badges',
    alias: 'getBadges',
    description: '全バッジ定義を取得（認証不要）',
    parameters: [
      {
        name: 'includeHidden',
        type: 'Query',
        schema: z.enum(['1', 'true']).optional()
      }
    ],
    response: GetBadgesResponseSchema
  },
  {
    method: 'get',
    path: '/api/users/me/badges',
    alias: 'getMyBadges',
    description: '自分の獲得バッジ一覧を取得',
    response: GetMyBadgesResponseSchema
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
    response: GetBadgeLeaderboardResponseSchema
  },
  // 管理者バッジCRUD API
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
    response: z.object({ badge: BadgeSchema })
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
    response: z.object({ badge: BadgeSchema })
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
  // コメント関連API
  {
    method: 'get',
    path: '/api/events/:uuid/comments',
    alias: 'getEventComments',
    description: 'イベントのコメント一覧を取得',
    response: ListCommentsResponseSchema
  },
  {
    method: 'post',
    path: '/api/events/:uuid/comments',
    alias: 'createEventComment',
    description: 'イベントにコメントを投稿',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateCommentRequestSchema
      }
    ],
    response: z.object({ id: z.string() })
  },
  {
    method: 'delete',
    path: '/api/events/:uuid/comments/:commentId',
    alias: 'deleteEventComment',
    description: 'イベントのコメントを削除（管理者）',
    parameters: [
      {
        name: 'uuid',
        type: 'Path',
        schema: z.string().nonempty()
      },
      {
        name: 'commentId',
        type: 'Path',
        schema: z.string().nonempty()
      }
    ],
    response: z.object({ message: z.string() })
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
  }
])

/**
 * Zodiosクライアント
 */
export const client = new Zodios('/', api)
