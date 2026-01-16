import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { PageViewQuerySchema, PageViewStatsSchema } from '@/schemas/stats.dto'
import type { Bindings, Variables } from '@/types/bindings'

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * 今日の日付を取得（JST）
 */
const getTodayKey = (): string => {
  const now = new Date()
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const year = jst.getFullYear()
  const month = String(jst.getMonth() + 1).padStart(2, '0')
  const day = String(jst.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * KVからページビュー統計を取得
 */
const getPageViewStats = async (env: Bindings, path?: string): Promise<number> => {
  const key = path ? `pv:${path}` : 'pv:total'
  const value = await env.VOTE_LIMITER.get(key)
  return value ? Number.parseInt(value, 10) : 0
}

/**
 * 今日のページビュー数を取得
 */
const getTodayPageViews = async (env: Bindings): Promise<number> => {
  const todayKey = `pv:daily:${getTodayKey()}`
  const value = await env.VOTE_LIMITER.get(todayKey)
  return value ? Number.parseInt(value, 10) : 0
}

/**
 * KVにページビューを記録（インクリメント）
 */
export const incrementPageView = async (env: Bindings, path: string): Promise<void> => {
  // 全体のカウント
  const totalKey = 'pv:total'
  const totalValue = await env.VOTE_LIMITER.get(totalKey)
  const totalCount = totalValue ? Number.parseInt(totalValue, 10) : 0
  await env.VOTE_LIMITER.put(totalKey, String(totalCount + 1))

  // 今日のカウント
  const todayKey = `pv:daily:${getTodayKey()}`
  const todayValue = await env.VOTE_LIMITER.get(todayKey)
  const todayCount = todayValue ? Number.parseInt(todayValue, 10) : 0
  await env.VOTE_LIMITER.put(todayKey, String(todayCount + 1), {
    expirationTtl: 60 * 60 * 24 * 7 // 7日後に自動削除
  })

  // パスごとのカウント
  const pathKey = `pv:${path}`
  const pathValue = await env.VOTE_LIMITER.get(pathKey)
  const pathCount = pathValue ? Number.parseInt(pathValue, 10) : 0
  await env.VOTE_LIMITER.put(pathKey, String(pathCount + 1))

  console.log(
    `[PageView] Incremented: ${path} (total: ${totalCount + 1}, today: ${todayCount + 1}, path: ${pathCount + 1})`
  )
}

/**
 * 全パスの統計を取得
 */
const getAllPathStats = async (env: Bindings): Promise<Record<string, number>> => {
  // KVから全てのpv:*キーを取得
  const list = await env.VOTE_LIMITER.list({ prefix: 'pv:' })
  const stats: Record<string, number> = {}

  for (const key of list.keys) {
    if (key.name === 'pv:total') continue
    const path = key.name.replace('pv:', '')
    const value = await env.VOTE_LIMITER.get(key.name)
    if (value) {
      stats[path] = Number.parseInt(value, 10)
    }
  }

  return stats
}

/**
 * ページビュー統計取得
 * GET /api/stats
 */
routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    request: {
      query: PageViewQuerySchema
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: PageViewStatsSchema
          }
        },
        description: 'ページビュー統計取得成功'
      }
    }
  }),
  async (c) => {
    const { path } = c.req.valid('query')

    if (path) {
      // 特定パスの統計
      const count = await getPageViewStats(c.env, path)
      const today = await getTodayPageViews(c.env)
      return c.json({
        total: count,
        today,
        paths: { [path]: count }
      })
    }

    // 全体の統計
    const total = await getPageViewStats(c.env)
    const today = await getTodayPageViews(c.env)
    const paths = await getAllPathStats(c.env)

    return c.json({
      total,
      today,
      paths
    })
  }
)

export default routes
