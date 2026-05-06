import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { SearchQuerySchema, SearchResultSchema } from '@/schemas/search.dto'
import { searchEvents } from '@/services/event-service'
import type { Bindings } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    request: {
      query: SearchQuerySchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SearchResultSchema
          }
        },
        description: 'イベント検索結果取得成功'
      },
      400: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().nonempty()
            })
          }
        },
        description: 'バリデーションエラー'
      }
    },
    tags: ['search']
  }),
  async (c) => {
    const { q } = c.req.valid('query')
    const events = await searchEvents(c.env, q)
    return c.json({ events }, 200)
  }
)

export default routes
