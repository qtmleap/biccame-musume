import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { CFAuth } from '@/middleware/cloudflare-access'
import { AdminTwitterStatusResponseSchema } from '@/schemas/admin-twitter.dto'
import type { Bindings } from '@/types/bindings'
import { Twitter } from '@/utils/twitter'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

// GET /api/admin/twitter/status — 投稿用アカウントのヘルスチェック
routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/twitter/status',
    middleware: [CFAuth],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: AdminTwitterStatusResponseSchema
          }
        },
        description: '投稿用 X アカウントの取得結果（成功・失敗いずれも 200）'
      }
    },
    tags: ['admin-twitter']
  }),
  async (c) => {
    const fetchedAt = new Date().toISOString()
    try {
      const account = await new Twitter(c.env).getOwnAccount()
      return c.json({ ok: true, account, error: null, fetchedAt }, 200)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[admin-twitter] status check failed:', message)
      return c.json({ ok: false, account: null, error: message, fetchedAt }, 200)
    }
  }
)

export default routes
