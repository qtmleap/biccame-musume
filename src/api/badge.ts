import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import {
  BadgeLeaderboardResponseSchema,
  GetBadgeLeaderboardQuerySchema,
  GetBadgesResponseSchema,
  MyBadgesResponseSchema,
  prismaBadgeToDto
} from '@/schemas/badge.dto'
import type { Bindings, Variables } from '@/types/bindings'
import { getJwtPayload, getToken, verifyToken, verifyTokenOptional } from '@/utils/token'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

routes.openapi(
  createRoute({
    method: 'get',
    path: '/badges',
    middleware: [verifyTokenOptional],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: GetBadgesResponseSchema
          }
        },
        description: '全バッジ定義取得成功'
      }
    },
    tags: ['badges']
  }),
  async (c) => {
    const prisma = getPrisma(c.env)
    const rows = await prisma.badge.findMany({
      where: { isHidden: false },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }]
    })

    // 未取得バッジは name/description/hint をマスクしてネタバレ防止
    const uid = ((): string | null => {
      try {
        return getJwtPayload(c).uid
      } catch {
        return null
      }
    })()

    const earnedSet = uid
      ? new Set(
          (
            await prisma.userBadge.findMany({
              where: { userId: uid },
              select: { badgeCode: true }
            })
          ).map((ub) => ub.badgeCode)
        )
      : new Set<string>()

    // 認証あり = ユーザーごとのレスポンスはキャッシュ不可、未認証は全件マスクで public 可
    c.header('Cache-Control', uid ? 'no-store' : 'public, max-age=300, s-maxage=3600')

    return c.json({ badges: rows.map((b) => prismaBadgeToDto(b, undefined, !earnedSet.has(b.code))) })
  }
)

routes.openapi(
  createRoute({
    method: 'get',
    path: '/badges/leaderboard',
    request: {
      query: GetBadgeLeaderboardQuerySchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: BadgeLeaderboardResponseSchema
          }
        },
        description: 'バッジリーダーボード取得成功'
      }
    },
    tags: ['badges']
  }),
  async (c) => {
    const prisma = getPrisma(c.env)
    const { uid } = c.req.valid('query')

    type LeaderboardRow = {
      uid: string
      display_name: string | null
      thumbnail_url: string | null
      earned_count: bigint
      first_earned: string
    }

    const rows = await prisma.$queryRaw<LeaderboardRow[]>`
      SELECT
        u.id AS uid,
        u.display_name,
        u.thumbnail_url,
        COUNT(ub.badge_code) AS earned_count,
        MIN(ub.earned_at) AS first_earned
      FROM user_badges ub
      JOIN badges b ON ub.badge_code = b.code
      JOIN users u ON ub.user_id = u.id
      WHERE b.is_hidden = 0
      GROUP BY u.id, u.display_name, u.thumbnail_url
      ORDER BY earned_count DESC, first_earned ASC
      LIMIT 50
    `

    const top = rows.map((row, idx) => ({
      uid: row.uid,
      displayName: row.display_name,
      thumbnailURL: row.thumbnail_url ?? undefined,
      earnedCount: Number(row.earned_count),
      rank: idx + 1
    }))

    const me = await (async (): Promise<{ rank: number; earnedCount: number } | undefined> => {
      if (!uid) return undefined

      type MyStatsRow = {
        earned_count: bigint
        first_earned: string | null
      }

      const myRows = await prisma.$queryRaw<MyStatsRow[]>`
        SELECT
          COUNT(ub.badge_code) AS earned_count,
          MIN(ub.earned_at) AS first_earned
        FROM user_badges ub
        JOIN badges b ON ub.badge_code = b.code
        WHERE ub.user_id = ${uid}
          AND b.is_hidden = 0
      `

      const myCount = myRows.length > 0 ? Number(myRows[0].earned_count) : 0
      const myFirstEarned = myRows.length > 0 ? myRows[0].first_earned : null

      type RankRow = { rank_above: bigint }

      const rankRows = await prisma.$queryRaw<RankRow[]>`
        SELECT COUNT(*) AS rank_above
        FROM (
          SELECT
            ub2.user_id,
            COUNT(ub2.badge_code) AS earned_count,
            MIN(ub2.earned_at) AS first_earned
          FROM user_badges ub2
          JOIN badges b2 ON ub2.badge_code = b2.code
          WHERE b2.is_hidden = 0
          GROUP BY ub2.user_id
        ) agg
        WHERE agg.earned_count > ${myCount}
          OR (agg.earned_count = ${myCount} AND ${myFirstEarned} IS NOT NULL AND agg.first_earned < ${myFirstEarned})
      `

      const rankAbove = rankRows.length > 0 ? Number(rankRows[0].rank_above) : 0
      return { rank: rankAbove + 1, earnedCount: myCount }
    })()

    c.header('Cache-Control', 'public, max-age=60, s-maxage=120')
    return c.json({ top, ...(me !== undefined ? { me } : {}) })
  }
)

routes.openapi(
  createRoute({
    method: 'get',
    path: '/users/me/badges',
    middleware: [verifyToken],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: MyBadgesResponseSchema
          }
        },
        description: '自分の獲得バッジ取得成功'
      }
    },
    tags: ['badges']
  }),
  async (c) => {
    const uid = getToken(c)
    const prisma = getPrisma(c.env)
    const userBadges = await prisma.userBadge.findMany({
      where: { userId: uid },
      orderBy: { earnedAt: 'asc' }
    })
    const earned = userBadges.map((ub) => ({
      code: ub.badgeCode,
      earnedAt: ub.earnedAt.toISOString()
    }))
    return c.json({ earned })
  }
)

export default routes
