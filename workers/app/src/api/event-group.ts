import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { EventGroupDetailSchema, EventGroupSchema } from '@/schemas/event-group.dto'
import { getEventGroupById, getEventGroups } from '@/services/event-group-service'
import type { Bindings } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings }>()

routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.array(EventGroupSchema)
          }
        },
        description: 'イベントグループ一覧取得成功'
      }
    },
    tags: ['event-groups']
  }),
  async (c) => {
    return c.json(await getEventGroups(c.env))
  }
)

routes.openapi(
  createRoute({
    method: 'get',
    path: '/:id',
    request: {
      params: z.object({
        id: z.string().nonempty()
      })
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: EventGroupDetailSchema
          }
        },
        description: 'イベントグループ詳細取得成功'
      },
      404: {
        content: {
          'application/json': {
            schema: z.object({
              error: z.string().nonempty()
            })
          }
        },
        description: 'グループが見つかりません'
      }
    },
    tags: ['event-groups']
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await getEventGroupById(c.env, id), 200)
  }
)

export default routes
