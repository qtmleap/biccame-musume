import { makeApi } from '@zodios/core'
import { StoresSchema } from '@/schemas/store.dto'

export const charactersEndpoints = makeApi([
  {
    method: 'get',
    path: '/characters.json',
    alias: 'getCharacters',
    description: 'ビッカメ娘キャラクター一覧を取得',
    response: StoresSchema
  }
])
