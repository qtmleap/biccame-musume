import { z } from 'zod'

/**
 * ページビュー統計のスキーマ
 */
export const PageViewStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  today: z.number().int().nonnegative(),
  paths: z.record(z.string(), z.number().int().nonnegative()).optional()
})


/**
 * ページビュー取得リクエストのクエリパラメータ
 */
export const PageViewQuerySchema = z.object({
  path: z.string().optional()
})


/**
 * ページビュー記録リクエストのスキーマ
 */
export const TrackPageViewSchema = z.object({
  path: z.string().min(1)
})


/**
 * ページビュー記録レスポンスのスキーマ
 */
export const TrackPageViewResponseSchema = z.object({
  success: z.boolean()
})

