import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { Bindings } from '@/types/bindings'
import { VersionResponseSchema } from '@/utils/client'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: VersionResponseSchema
          }
        },
        description: 'アプリのバージョン情報を取得'
      }
    },
    tags: ['version']
  }),
  (c) => {
    return c.json({
      version: __APP_VERSION__,
      hash: __GIT_HASH__,
      buildAt: __BUILD_AT__
    })
  }
)

export default routes
