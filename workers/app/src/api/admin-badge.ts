import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import {
  AdminBadgeParamsSchema,
  AdminBadgeRankingQuerySchema,
  AdminBadgeRankingResponseSchema,
  AdminDeleteBadgeParamsSchema,
  BadgeHoldersResponseSchema,
  BadgeMutationResponseSchema,
  type CreateSpecialBadgeBody,
  CreateSpecialBadgeBodySchema,
  GetBadgeHoldersParamsSchema,
  GetBadgesResponseSchema,
  prismaBadgeToDto,
  UpdateBadgeBodySchema
} from '@/schemas/badge.dto'
import { evaluateAllUsersBadges } from '@/services/badge'
import type { Bindings } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

// GET /api/admin/badges — 全バッジ取得 (隠しバッジ + earnedCount 含む、admin 専用)
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/badges',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: GetBadgesResponseSchema
          }
        },
        description: '全バッジ定義取得成功 (admin)'
      }
    },
    tags: ['admin-badges']
  }),
  async (c) => {
    const prisma = getPrisma(c.env)
    const rows = await prisma.badge.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }]
    })
    const countRows = await prisma.userBadge.groupBy({
      by: ['badgeCode'],
      _count: { _all: true }
    })
    const countMap = new Map<string, number>(countRows.map((r) => [r.badgeCode, r._count._all]))
    c.header('Cache-Control', 'no-store')
    return c.json({ badges: rows.map((b) => prismaBadgeToDto(b, countMap.get(b.code) ?? 0)) })
  }
)

/**
 * Generate an 8-char URL-safe random string using Web Crypto (no nanoid dep).
 */
function generateShortId(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '0')
    .replace(/\//g, '1')
    .replace(/=/g, '')
    .slice(0, 8)
}

function isSpecialCode(code: string): boolean {
  return code.startsWith('special_')
}

function validateSpecialConditionMeta(body: CreateSpecialBadgeBody): string | null {
  const { sub_category, condition_meta } = body
  if (sub_category === 'special_multi_store_clear') {
    if (!('storeKeys' in condition_meta) || !condition_meta.storeKeys?.length) {
      return 'sub_category が special_multi_store_clear の場合は condition_meta.storeKeys が必要です'
    }
  } else if (sub_category === 'special_event_id') {
    if (!('eventId' in condition_meta) || !condition_meta.eventId) {
      return 'sub_category が special_event_id の場合は condition_meta.eventId が必要です'
    }
  }
  return null
}

// POST /api/admin/badges — special バッジ作成
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/badges',
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateSpecialBadgeBodySchema
          }
        }
      }
    },
    responses: {
      201: {
        content: {
          'application/json': {
            schema: BadgeMutationResponseSchema
          }
        },
        description: 'special バッジ作成成功'
      },
      400: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string().nonempty() })
          }
        },
        description: 'バリデーションエラー'
      }
    },
    tags: ['admin-badges']
  }),
  async (c) => {
    const body = c.req.valid('json')
    const metaError = validateSpecialConditionMeta(body)
    if (metaError) {
      return c.json({ error: metaError }, 400)
    }

    const code = `special_${generateShortId()}`
    const prisma = getPrisma(c.env)

    const created = await prisma.badge.create({
      data: {
        code,
        category: 'special',
        subCategory: body.sub_category,
        name: body.name,
        description: body.description,
        hint: body.hint,
        rarity: body.rarity,
        iconName: body.icon_name,
        sortOrder: body.sort_order,
        conditionMeta: JSON.stringify(body.condition_meta),
        isHidden: false
      }
    })

    return c.json({ badge: prismaBadgeToDto(created) }, 201)
  }
)

// PATCH /api/admin/badges/:code — バッジ更新
routes.openapi(
  createRoute({
    method: 'patch',
    path: '/admin/badges/:code',
    request: {
      params: AdminBadgeParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateBadgeBodySchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: BadgeMutationResponseSchema
          }
        },
        description: 'バッジ更新成功'
      },
      400: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string().nonempty() })
          }
        },
        description: 'バリデーションエラー'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string().nonempty() })
          }
        },
        description: 'バッジが見つかりません'
      }
    },
    tags: ['admin-badges']
  }),
  async (c) => {
    const { code } = c.req.valid('param')
    const body = c.req.valid('json')
    const special = isSpecialCode(code)

    if (!special && (body.sub_category !== undefined || body.condition_meta !== undefined)) {
      return c.json({ error: 'auto-generated バッジの sub_category / condition_meta は変更できません' }, 400)
    }

    const prisma = getPrisma(c.env)
    const existing = await prisma.badge.findUnique({ where: { code } })
    if (!existing) {
      return c.json({ error: 'バッジが見つかりません' }, 404)
    }

    // sub_category と condition_meta のクロス検証は、片方だけの更新でも走らせる。
    // 既存 badge の値と body の値を合成して、更新後の組み合わせで validate する
    // ——さもないと meta と sub の不整合を経由して「毒バッジ」を作れてしまう。
    if (special && (body.sub_category !== undefined || body.condition_meta !== undefined)) {
      const nextSub = body.sub_category ?? (existing.subCategory as CreateSpecialBadgeBody['sub_category'])
      const nextMeta =
        body.condition_meta ?? (JSON.parse(existing.conditionMeta) as CreateSpecialBadgeBody['condition_meta'])
      const metaError = validateSpecialConditionMeta({
        sub_category: nextSub,
        condition_meta: nextMeta
      } as CreateSpecialBadgeBody)
      if (metaError) {
        return c.json({ error: metaError }, 400)
      }
    }

    const updated = await prisma.badge.update({
      where: { code },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.hint !== undefined && { hint: body.hint }),
        ...(body.rarity !== undefined && { rarity: body.rarity }),
        ...(body.icon_name !== undefined && { iconName: body.icon_name }),
        ...(body.sort_order !== undefined && { sortOrder: body.sort_order }),
        ...(body.is_hidden !== undefined && { isHidden: body.is_hidden }),
        ...(special && body.sub_category !== undefined && { subCategory: body.sub_category }),
        ...(special && body.condition_meta !== undefined && { conditionMeta: JSON.stringify(body.condition_meta) })
      }
    })

    return c.json({ badge: prismaBadgeToDto(updated) }, 200)
  }
)

// DELETE /api/admin/badges/:code — special バッジ削除
routes.openapi(
  createRoute({
    method: 'delete',
    path: '/admin/badges/:code',
    request: {
      params: AdminDeleteBadgeParamsSchema
    },
    responses: {
      204: {
        description: 'special バッジ削除成功'
      },
      400: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string().nonempty() })
          }
        },
        description: 'auto-generated バッジは削除できません'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string().nonempty() })
          }
        },
        description: 'バッジが見つかりません'
      }
    },
    tags: ['admin-badges']
  }),
  async (c) => {
    const { code } = c.req.valid('param')

    if (!isSpecialCode(code)) {
      return c.json({ error: 'auto-generated バッジは削除できません' }, 400)
    }

    const prisma = getPrisma(c.env)
    const existing = await prisma.badge.findUnique({ where: { code } })
    if (!existing) {
      return c.json({ error: 'バッジが見つかりません' }, 404)
    }

    await prisma.badge.delete({ where: { code } })
    return c.body(null, 204)
  }
)

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
            schema: z.object({ error: z.string().nonempty() })
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
