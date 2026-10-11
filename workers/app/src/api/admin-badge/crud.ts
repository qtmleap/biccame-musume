import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import {
  AdminBadgeParamsSchema,
  AdminDeleteBadgeParamsSchema,
  BadgeMutationResponseSchema,
  type CreateSpecialBadgeBody,
  CreateSpecialBadgeBodySchema,
  GetBadgesResponseSchema,
  prismaBadgeToDto,
  UpdateBadgeBodySchema
} from '@/schemas/badge.dto'
import type { Bindings } from '@/types/bindings'
import { ErrorResponseSchema } from './error-schema'
import { generateShortId, isSpecialCode, validateSpecialConditionMeta } from './special-badge'

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
            schema: ErrorResponseSchema
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
            schema: ErrorResponseSchema
          }
        },
        description: 'バリデーションエラー'
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
            schema: ErrorResponseSchema
          }
        },
        description: 'auto-generated バッジは削除できません'
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

export default routes
