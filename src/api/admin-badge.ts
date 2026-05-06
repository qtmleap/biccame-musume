import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import { CFAuth } from '@/middleware/cloudflare-access'
import {
  AdminBadgeParamsSchema,
  AdminDeleteBadgeParamsSchema,
  type CreateSpecialBadgeBody,
  CreateSpecialBadgeBodySchema,
  prismaBadgeToDto,
  UpdateBadgeBodySchema
} from '@/schemas/badge.dto'
import { evaluateAndAwardBadges } from '@/services/badge-evaluator'
import type { Bindings } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

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
    middleware: [CFAuth],
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
            schema: z.object({
              badge: z
                .object({
                  code: z.string(),
                  category: z.string(),
                  sub_category: z.string(),
                  name: z.string(),
                  description: z.string(),
                  hint: z.string(),
                  rarity: z.string(),
                  icon_name: z.string(),
                  sort_order: z.number(),
                  condition_meta: z.string(),
                  is_hidden: z.boolean(),
                  created_at: z.string(),
                  updated_at: z.string()
                })
                .openapi('AdminCreatedBadge')
            })
          }
        },
        description: 'special バッジ作成成功'
      },
      400: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
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
    middleware: [CFAuth],
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
            schema: z.object({
              badge: z
                .object({
                  code: z.string(),
                  category: z.string(),
                  sub_category: z.string(),
                  name: z.string(),
                  description: z.string(),
                  hint: z.string(),
                  rarity: z.string(),
                  icon_name: z.string(),
                  sort_order: z.number(),
                  condition_meta: z.string(),
                  is_hidden: z.boolean(),
                  created_at: z.string(),
                  updated_at: z.string()
                })
                .openapi('AdminUpdatedBadge')
            })
          }
        },
        description: 'バッジ更新成功'
      },
      400: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
          }
        },
        description: 'バリデーションエラー'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
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

    if (special && body.sub_category !== undefined && body.condition_meta !== undefined) {
      const mockBody = {
        sub_category: body.sub_category,
        condition_meta: body.condition_meta
      } as CreateSpecialBadgeBody
      const metaError = validateSpecialConditionMeta(mockBody)
      if (metaError) {
        return c.json({ error: metaError }, 400)
      }
    }

    const prisma = getPrisma(c.env)
    const existing = await prisma.badge.findUnique({ where: { code } })
    if (!existing) {
      return c.json({ error: 'バッジが見つかりません' }, 404)
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
    middleware: [CFAuth],
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
            schema: z.object({ error: z.string() })
          }
        },
        description: 'auto-generated バッジは削除できません'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
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

// POST /api/admin/badges/recalculate — 全ユーザー × 全バッジを再評価して獲得を反映
// 店舗数や条件メタが変わった時に管理者が手動で叩く想定。重い処理なので頻繁には呼ばない。
routes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/badges/recalculate',
    middleware: [CFAuth],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z
              .object({
                processedUsers: z.number(),
                awardedTotal: z.number()
              })
              .openapi('AdminBadgeRecalculateResult')
          }
        },
        description: 'バッジ再評価完了'
      }
    },
    tags: ['admin-badges']
  }),
  async (c) => {
    const prisma = getPrisma(c.env)
    const users = await prisma.user.findMany({ select: { id: true } })

    let awardedTotal = 0
    for (const user of users) {
      const newBadges = await evaluateAndAwardBadges({ env: c.env, prisma, userId: user.id })
      awardedTotal += newBadges.length
    }

    return c.json({ processedUsers: users.length, awardedTotal }, 200)
  }
)

export default routes
