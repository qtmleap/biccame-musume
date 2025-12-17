import { makeApi, Zodios } from '@zodios/core'
import { CharactersSchema } from '@/schemas/character.dto'

/**
 * キャラクターAPI定義
 */
const characterApi = makeApi([
  {
    method: 'get',
    path: '/characters.json',
    alias: 'getCharacters',
    description: 'ビッカメ娘キャラクター一覧を取得',
    response: CharactersSchema
  }
])

/**
 * Zodiosクライアント
 */
export const client = new Zodios('/', characterApi)
