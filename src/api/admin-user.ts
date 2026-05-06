import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import { CFAuth } from '@/middleware/cloudflare-access'
import { AdminUserListResponseSchema } from '@/schemas/user.dto'
import type { Bindings } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

// GET /api/admin/users — 登録ユーザー一覧（admin）
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/users',
    middleware: [CFAuth],
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
    return c.json({ users }, 200)
  }
)

export default routes
