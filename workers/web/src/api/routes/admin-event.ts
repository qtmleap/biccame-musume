import { getAdminEvents, getAdminWebhookEvents } from '@api/services/event-service'
import type { Bindings } from '@api/types/bindings'
import { EventSchema } from '@biccame/shared/schemas/event.dto'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

/**
 * 管理者向けイベント API。
 * 認証は src/api/admin/index.ts で /admin/* 全体に CFAuth を適用しているため
 * 個別ルートでは middleware: [CFAuth] を指定しない。
 */
const routes = new OpenAPIHono<{ Bindings: Bindings }>()

routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/events',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.array(EventSchema)
          }
        },
        description: 'イベント一覧取得成功 (未確認のイベントを含む)'
      }
    },
    tags: ['admin-events']
  }),
  async (c) => {
    return c.json(await getAdminEvents(c.env))
  }
)

routes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/webhook-events',
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(EventSchema) } },
        description: 'Webhook由来で新規作成したイベント一覧'
      }
    },
    tags: ['admin-events']
  }),
  async (c) => c.json(await getAdminWebhookEvents(c.env))
)

export default routes
