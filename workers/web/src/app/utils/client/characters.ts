import { StoresSchema } from '@biccame/shared/schemas/store.dto'
import { makeApi } from '@zodios/core'

export const charactersEndpoints = makeApi([
  {
    method: 'get',
    path: '/characters.json',
    alias: 'getCharacters',
    description: 'ビッカメ娘キャラクター一覧を取得',
    response: StoresSchema
  }
])
