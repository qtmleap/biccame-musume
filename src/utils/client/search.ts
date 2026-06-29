import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { SearchResultSchema } from '@/schemas/search.dto'

export const searchEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/search',
    alias: 'searchEvents',
    description: 'イベントをタイトルで全文検索',
    parameters: [
      {
        name: 'q',
        type: 'Query',
        schema: z.string().min(1).max(100)
      }
    ],
    response: SearchResultSchema
  }
])
