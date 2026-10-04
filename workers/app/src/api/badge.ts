import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import {
  BadgeHoldersCountResponseSchema,
  GetBadgeHoldersParamsSchema,
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

// 個人情報保護のため公開APIは獲得人数のみ返す。獲得者一覧は /api/admin/badges/:code/holders (admin) から取得する。
routes.openapi(
  createRoute({
    method: 'get',
    path: '/badges/:code/holders',
    request: {
      params: GetBadgeHoldersParamsSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: BadgeHoldersCountResponseSchema
          }
        },
        description: 'バッジ獲得人数取得成功'
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
    tags: ['badges']
  }),
  async (c) => {
    const { code } = c.req.valid('param')
    const prisma = getPrisma(c.env)

    const badge = await prisma.badge.findUnique({ where: { code }, select: { isHidden: true } })
    if (!badge || badge.isHidden) {
      return c.json({ error: 'バッジが見つかりません' }, 404)
    }

    const total = await prisma.userBadge.count({ where: { badgeCode: code } })

    c.header('Cache-Control', 'public, max-age=60, s-maxage=120')
    return c.json({ total }, 200)
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
