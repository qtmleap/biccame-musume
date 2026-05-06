import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { getPrisma } from '@/lib/prisma'
import { CFAuth } from '@/middleware/cloudflare-access'
import {
  type AdminComment,
  AdminCommentsQuerySchema,
  AdminCommentsResponseSchema
} from '@/schemas/admin-comment.dto'
import type { Bindings } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

// GET /api/admin/comments — 全コメント一覧（イベント名つき・新しい順）
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/comments',
    middleware: [CFAuth],
    request: {
      query: AdminCommentsQuerySchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: AdminCommentsResponseSchema
          }
        },
        description: 'コメント一覧取得成功'
      }
    },
    tags: ['admin-comments']
  }),
  async (c) => {
    const { includeDeleted } = c.req.valid('query')
    const prisma = getPrisma(c.env)

    const rows = await prisma.eventComment.findMany({
      where: includeDeleted === '1' ? undefined : { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { event: { select: { title: true } } }
    })

    const comments: AdminComment[] = rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      eventTitle: row.event.title,
      characterId: row.nickname,
      body: row.body,
      ipAddress: row.ipAddress,
      userId: row.userId,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString()
    }))

    return c.json({ comments }, 200)
  }
)

export default routes
