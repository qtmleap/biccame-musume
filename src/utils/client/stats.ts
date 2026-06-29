import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { PageViewStatsSchema } from '@/schemas/stats.dto'

export const statsEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/stats',
    alias: 'getPageViews',
    description: 'ページビュー統計を取得',
    parameters: [
      {
        name: 'path',
        type: 'Query',
        schema: z.string().nonempty().optional()
      }
    ],
    response: PageViewStatsSchema
  },
  {
    method: 'post',
    path: '/api/stats',
    alias: 'trackPageView',
    description: 'ページビューを記録',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({ path: z.string().min(1) })
      }
    ],
    response: z.object({ success: z.boolean() })
  }
])
