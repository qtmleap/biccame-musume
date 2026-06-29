import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { SuccessResponseSchemaForClient } from '@/schemas/activity.dto'
import { FavoriteCharactersResponseSchemaForClient } from '@/schemas/favorite.dto'

export const favoritesEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/me/favorites',
    alias: 'getFavoriteCharacters',
    description: 'お気に入りキャラクター一覧を取得',
    response: FavoriteCharactersResponseSchemaForClient
  },
  {
    method: 'post',
    path: '/api/me/favorites/:characterId',
    alias: 'addFavoriteCharacter',
    description: 'お気に入りキャラクターを追加',
    parameters: [
      {
        name: 'characterId',
        type: 'Path',
        schema: z.string().nonempty()
      }
    ],
    response: SuccessResponseSchemaForClient
  },
  {
    method: 'delete',
    path: '/api/me/favorites/:characterId',
    alias: 'removeFavoriteCharacter',
    description: 'お気に入りキャラクターを削除',
    parameters: [
      {
        name: 'characterId',
        type: 'Path',
        schema: z.string().nonempty()
      }
    ],
    response: SuccessResponseSchemaForClient
  }
])
