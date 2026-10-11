import { getToken, verifyToken } from '@api/lib/token'
import { addFavoriteCharacter, listFavoriteCharacters, removeFavoriteCharacter } from '@api/services/favorite-service'
import type { Bindings, Variables } from '@api/types/bindings'
import { SuccessResponseSchema } from '@biccame/shared/schemas/activity.dto'
import { CharacterIdParamSchema, FavoriteCharactersResponseSchema } from '@biccame/shared/schemas/favorite.dto'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * お気に入りキャラクター一覧
 * GET /api/me/favorites
 */
routes.openapi(
  createRoute({
    method: 'get',
    path: '/me/favorites',
    middleware: [verifyToken],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: FavoriteCharactersResponseSchema
          }
        },
        description: 'お気に入りキャラクター一覧取得成功'
      }
    },
    tags: ['favorites']
  }),
  async (c) => {
    const uid = getToken(c)
    const favorites = await listFavoriteCharacters(c.env, uid)
    return c.json({ favorites })
  }
)

/**
 * お気に入りキャラクター追加
 * POST /api/me/favorites/:characterId
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/me/favorites/:characterId',
    middleware: [verifyToken],
    request: {
      params: CharacterIdParamSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SuccessResponseSchema
          }
        },
        description: 'お気に入り追加成功'
      }
    },
    tags: ['favorites']
  }),
  async (c) => {
    const uid = getToken(c)
    const { characterId } = c.req.valid('param')
    await addFavoriteCharacter(c.env, uid, characterId)
    return c.json({ success: true })
  }
)

/**
 * お気に入りキャラクター削除
 * DELETE /api/me/favorites/:characterId
 */
routes.openapi(
  createRoute({
    method: 'delete',
    path: '/me/favorites/:characterId',
    middleware: [verifyToken],
    request: {
      params: CharacterIdParamSchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SuccessResponseSchema
          }
        },
        description: 'お気に入り削除成功'
      }
    },
    tags: ['favorites']
  }),
  async (c) => {
    const uid = getToken(c)
    const { characterId } = c.req.valid('param')
    await removeFavoriteCharacter(c.env, uid, characterId)
    return c.json({ success: true })
  }
)

export default routes
