import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import {
  AdminBadgeRankingQuerySchema,
  AdminBadgeRankingResponseSchema,
  BadgeHoldersResponseSchema,
  GetBadgeHoldersParamsSchema
} from '@/schemas/badge.dto'
import { evaluateAllUsersBadges } from '@/services/badge'
import type { Bindings } from '@/types/bindings'
import { ErrorResponseSchema } from './error-schema'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

// GET /api/admin/badges/leaderboard — バッジ所持数ランキング（隠しバッジも集計対象、admin 専用）
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/badges/leaderboard',
    request: {
      query: AdminBadgeRankingQuerySchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: AdminBadgeRankingResponseSchema
          }
        },
        description: 'バッジ所持数ランキング取得成功'
      }
    },
    tags: ['admin-badges']
  }),
  async (c) => {
    const { limit, offset } = c.req.valid('query')
    const prisma = getPrisma(c.env)

    type Row = {
      uid: string
      display_name: string | null
      thumbnail_url: string | null
      created_at: string
      earned_count: bigint
      last_earned_at: string
      first_earned_at: string
      rarity_common: bigint
      rarity_rare: bigint
      rarity_epic: bigint
      rarity_legendary: bigint
      rarity_mythic: bigint
    }

    // 非表示バッジも集計に含める（管理者は全体像を把握したい）
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        u.id AS uid,
        u.display_name,
        u.thumbnail_url,
        u.created_at,
        COUNT(ub.badge_code) AS earned_count,
        MAX(ub.earned_at) AS last_earned_at,
        MIN(ub.earned_at) AS first_earned_at,
        SUM(CASE WHEN b.rarity = 'common' THEN 1 ELSE 0 END) AS rarity_common,
        SUM(CASE WHEN b.rarity = 'rare' THEN 1 ELSE 0 END) AS rarity_rare,
        SUM(CASE WHEN b.rarity = 'epic' THEN 1 ELSE 0 END) AS rarity_epic,
        SUM(CASE WHEN b.rarity = 'legendary' THEN 1 ELSE 0 END) AS rarity_legendary,
        SUM(CASE WHEN b.rarity = 'mythic' THEN 1 ELSE 0 END) AS rarity_mythic
      FROM users u
      JOIN user_badges ub ON u.id = ub.user_id
      JOIN badges b ON ub.badge_code = b.code
      GROUP BY u.id, u.display_name, u.thumbnail_url, u.created_at
      ORDER BY earned_count DESC, first_earned_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `

    type TotalRow = { total: bigint }
    const totalRows = await prisma.$queryRaw<TotalRow[]>`
      SELECT COUNT(DISTINCT user_id) AS total FROM user_badges
    `
    const total = totalRows.length > 0 ? Number(totalRows[0].total) : 0

    const entries = rows.map((row, idx) => ({
      rank: offset + idx + 1,
      uid: row.uid,
      displayName: row.display_name,
      thumbnailURL: row.thumbnail_url ?? undefined,
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
      earnedCount: Number(row.earned_count),
      lastEarnedAt:
        typeof row.last_earned_at === 'string' ? row.last_earned_at : new Date(row.last_earned_at).toISOString(),
      rarityBreakdown: {
        common: Number(row.rarity_common),
        rare: Number(row.rarity_rare),
        epic: Number(row.rarity_epic),
        legendary: Number(row.rarity_legendary),
        mythic: Number(row.rarity_mythic)
      }
    }))

    c.header('Cache-Control', 'no-store')
    return c.json({ total, entries }, 200)
  }
)

// GET /api/admin/badges/:code/holders — 指定バッジの獲得者一覧 (admin 専用)
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/badges/:code/holders',
    request: {
      params: GetBadgeHoldersParamsSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: BadgeHoldersResponseSchema
          }
        },
        description: 'バッジ獲得者一覧取得成功 (admin)'
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema
          }
        },
        description: 'バッジが見つかりません'
      }
    },
    tags: ['admin-badges']
  }),
  async (c) => {
    const { code } = c.req.valid('param')
    const prisma = getPrisma(c.env)

    const badge = await prisma.badge.findUnique({ where: { code }, select: { code: true } })
    if (!badge) {
      return c.json({ error: 'バッジが見つかりません' }, 404)
    }

    type HolderRow = {
      uid: string
      display_name: string | null
      thumbnail_url: string | null
      earned_at: string
    }

    const rows = await prisma.$queryRaw<HolderRow[]>`
      SELECT
        u.id AS uid,
        u.display_name,
        u.thumbnail_url,
        ub.earned_at
      FROM user_badges ub
      JOIN users u ON ub.user_id = u.id
      WHERE ub.badge_code = ${code}
      ORDER BY ub.earned_at ASC
      LIMIT 100
    `

    const total = await prisma.userBadge.count({ where: { badgeCode: code } })

    const holders = rows.map((row) => ({
      uid: row.uid,
      displayName: row.display_name,
      thumbnailURL: row.thumbnail_url ?? undefined,
      earnedAt: row.earned_at
    }))

    c.header('Cache-Control', 'no-store')
    return c.json({ total, holders }, 200)
  }
)

// POST /api/admin/badges/recalculate — 全ユーザー × 全バッジを再評価して獲得を反映
// 店舗数や条件メタが変わった時に管理者が手動で叩く想定。
// 重いので waitUntil でバックグラウンド実行し、レスポンスは即返す。
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/badges/recalculate',
    responses: {
      202: {
        content: {
          'application/json': {
            schema: z
              .object({
                processedUsers: z.number(),
                scheduled: z.literal(true)
              })
              .openapi('AdminBadgeRecalculateResult')
          }
        },
        description: 'バッジ再評価をバックグラウンドで開始'
      }
    },
    tags: ['admin-badges']
  }),
  async (c) => {
    const prisma = getPrisma(c.env)
    const users = await prisma.user.findMany({ select: { id: true } })

    c.executionCtx.waitUntil(evaluateAllUsersBadges(c.env, prisma))

    return c.json({ processedUsers: users.length, scheduled: true as const }, 202)
  }
)

export default routes
