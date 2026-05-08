import { z } from '@hono/zod-openapi'

/**
 * キャラクターIDパラメータ
 */
export const CharacterIdParamSchema = z
  .object({
    characterId: z.string().nonempty('キャラクターIDは必須です').openapi({ description: 'キャラクターID' })
  })
  .openapi('CharacterIdParam')

/**
 * お気に入りキャラクター一覧レスポンス
 */
export const FavoriteCharactersResponseSchema = z
  .object({
    favorites: z
      .array(z.string().nonempty('キャラクターIDは必須です'))
      .openapi({ description: 'お気に入りキャラクターIDの配列' })
  })
  .openapi('FavoriteCharactersResponse')

/**
 * Zodios クライアント用（OpenAPI ラッパなし）
 */
export const FavoriteCharactersResponseSchemaForClient = z.object({
  favorites: z.array(z.string().nonempty('キャラクターIDは必須です'))
})
