import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import {
  PageViewQuerySchema,
  PageViewStatsSchema,
  TrackPageViewResponseSchema,
  TrackPageViewSchema
} from '@/schemas/stats.dto'
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
 * IP + UA を SHA-256 でハッシュし、本日のユニークユーザー集計用キーに使う。
 * 先頭 16 文字 (64 bit) で 1 日 10 万ユニーク程度の衝突は無視できる。
 */
const computeUserKey = async (ip: string, userAgent: string): Promise<string> => {
  const data = new TextEncoder().encode(`${ip}\n${userAgent}`)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex.slice(0, 16)
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
    const dateKey = getTodayKey()
    const stub = c.env.STATS.get(c.env.STATS.idFromName('global'))
    const snap = await stub.snapshot({ dateKey })

    if (path) {
      return c.json({
        total: snap.paths[path] ?? 0,
        today: snap.today
      })
    }

    return c.json({
      total: snap.total,
      today: snap.today,
      paths: snap.paths
    })
  }
)

/**
 * ページビュー記録
 * POST /api/stats
 */
routes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    request: {
      body: {
        content: {
          'application/json': {
            schema: TrackPageViewSchema
          }
        }
      }
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: TrackPageViewResponseSchema
          }
        },
        description: 'ページビュー記録成功'
      }
    }
  }),
  async (c) => {
    const { path } = c.req.valid('json')
    const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown'
    const userAgent = c.req.header('User-Agent') ?? 'unknown'
    const userKey = await computeUserKey(ip, userAgent)
    const dateKey = getTodayKey()
    const stub = c.env.STATS.get(c.env.STATS.idFromName('global'))
    c.executionCtx.waitUntil(stub.increment({ path, dateKey, userKey }))

    return c.json({ success: true })
  }
)

export default routes
