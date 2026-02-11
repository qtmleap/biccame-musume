import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { PageViewQuerySchema, PageViewStatsSchema } from '@/schemas/stats.dto'
import type { Bindings, Variables } from '@/types/bindings'

dayjs.extend(utc)
dayjs.extend(timezone)

const routes = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * 今日の日付を取得（JST）
 */
const getTodayKey = (): string => {
  return dayjs().tz('Asia/Tokyo').format('YYYY-MM-DD')
}

/**
 * KVからページビュー統計を取得
 */
const getPageViewStats = async (env: Bindings, path?: string): Promise<number> => {
  const key = path ? `pv:${path}` : 'pv:total'
  const value = await env.PAGE_VIEWS.get(key)
  return value ? Number.parseInt(value, 10) : 0
}

/**
 * 今日のページビュー数を取得
 */
const getTodayPageViews = async (env: Bindings): Promise<number> => {
  const todayKey = `pv:daily:${getTodayKey()}`
  const value = await env.PAGE_VIEWS.get(todayKey)
  return value ? Number.parseInt(value, 10) : 0
}

/**
 * KVにページビューを記録（インクリメント）
 */
export const incrementPageView = async (env: Bindings, path: string): Promise<void> => {
  // 全体のカウント
  const totalKey = 'pv:total'
  const totalValue = await env.PAGE_VIEWS.get(totalKey)
  const totalCount = totalValue ? Number.parseInt(totalValue, 10) : 0
  await env.PAGE_VIEWS.put(totalKey, String(totalCount + 1))

  // 今日のカウント
  const todayKey = `pv:daily:${getTodayKey()}`
  const todayValue = await env.PAGE_VIEWS.get(todayKey)
  const todayCount = todayValue ? Number.parseInt(todayValue, 10) : 0
  await env.PAGE_VIEWS.put(todayKey, String(todayCount + 1), {
    expirationTtl: 60 * 60 * 24 * 7 // 7日後に自動削除
  })

  console.log(`[PageView] Today's key: ${todayKey} (count: ${todayCount + 1})`)

  // パスごとのカウント
  const pathKey = `pv:${path}`
  const pathValue = await env.PAGE_VIEWS.get(pathKey)
  const pathCount = pathValue ? Number.parseInt(pathValue, 10) : 0
  await env.PAGE_VIEWS.put(pathKey, String(pathCount + 1))

  console.log(
    `[PageView] Incremented: ${path} (total: ${totalCount + 1}, today: ${todayCount + 1}, path: ${pathCount + 1})`
  )
}

/**
 * 全パスの統計を取得
 */
const getAllPathStats = async (env: Bindings): Promise<Record<string, number>> => {
  // KVから全てのpv:*キーを取得
  const list = await env.PAGE_VIEWS.list({ prefix: 'pv:' })
  const stats: Record<string, number> = {}

  for (const key of list.keys) {
    if (key.name === 'pv:total') continue
    const path = key.name.replace('pv:', '')
    const value = await env.PAGE_VIEWS.get(key.name)
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
