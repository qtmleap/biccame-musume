import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import {
  AdminUserBadgesParamsSchema,
  AdminUserBadgesResponseSchema,
  type BadgeCategory,
  type BadgeRarity,
  type BadgeSubCategory
} from '@/schemas/badge.dto'
import { AdminUserListResponseSchema } from '@/schemas/user.dto'
import type { Bindings } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

// GET /api/admin/users — 登録ユーザー一覧（admin）
// 認証は src/api/admin/index.ts で `/admin/*` 全体に CFAuth を適用
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/users',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: AdminUserListResponseSchema
          }
        },
        description: 'ユーザー一覧取得成功'
      }
    },
    tags: ['admin-users']
  }),
  async (c) => {
    const prisma = getPrisma(c.env)
    const rows = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayName: true,
        email: true,
        thumbnailURL: true,
        createdAt: true
      }
    })
    const users = rows.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      thumbnailURL: u.thumbnailURL,
      createdAt: u.createdAt.toISOString()
    }))
    c.header('Cache-Control', 'no-store')
    return c.json({ users }, 200)
  }
)

// GET /api/admin/users/:uid/badges — 特定ユーザーの獲得バッジ一覧（admin）
// レアリティ順（mythic → common）、同レアリティ内は最新獲得順
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/users/:uid/badges',
    request: {
      params: AdminUserBadgesParamsSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: AdminUserBadgesResponseSchema
          }
        },
        description: 'ユーザーの獲得バッジ一覧取得成功'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string().nonempty() })
          }
        },
        description: 'ユーザーが見つかりません'
      }
    },
    tags: ['admin-users']
  }),
  async (c) => {
    const { uid } = c.req.valid('param')
    const prisma = getPrisma(c.env)

    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, displayName: true, thumbnailURL: true }
    })
    if (!user) {
      return c.json({ error: 'ユーザーが見つかりません' }, 404)
    }

    // レアリティの並び順を SQL 側で制御して、フロントでソート不要にする
    type Row = {
      code: string
      name: string
      category: string
      sub_category: string
      rarity: string
      icon_name: string
      earned_at: string
    }
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT b.code, b.name, b.category, b.sub_category, b.rarity, b.icon_name, ub.earned_at
      FROM user_badges ub
      JOIN badges b ON ub.badge_code = b.code
      WHERE ub.user_id = ${uid}
      ORDER BY
        CASE b.rarity
          WHEN 'mythic' THEN 0
          WHEN 'legendary' THEN 1
          WHEN 'epic' THEN 2
          WHEN 'rare' THEN 3
          WHEN 'common' THEN 4
          ELSE 5
        END ASC,
        ub.earned_at DESC
    `

    const badges = rows.map((row) => ({
      code: row.code,
      name: row.name,
      category: row.category as BadgeCategory,
      subCategory: row.sub_category as BadgeSubCategory,
      rarity: row.rarity as BadgeRarity,
      iconName: row.icon_name,
      earnedAt: typeof row.earned_at === 'string' ? row.earned_at : new Date(row.earned_at).toISOString()
    }))

    c.header('Cache-Control', 'no-store')
    return c.json(
      {
        user: {
          uid: user.id,
          displayName: user.displayName,
          thumbnailURL: user.thumbnailURL ?? undefined
        },
        badges
      },
      200
    )
  }
)

export default routes
