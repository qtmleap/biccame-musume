import { z } from 'zod'

/**
 * ページビュー統計のスキーマ
 */
export const PageViewStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  today: z.number().int().nonnegative(),
  paths: z.record(z.string(), z.number().int().nonnegative()).optional()
})

export type PageViewStats = z.infer<typeof PageViewStatsSchema>

/**
 * ページビュー取得リクエストのクエリパラメータ
 */
export const PageViewQuerySchema = z.object({
  path: z.string().optional()
})

export type PageViewQuery = z.infer<typeof PageViewQuerySchema>
