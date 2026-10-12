import { z } from 'zod'

/**
 * バージョン情報レスポンススキーマ
 */
export const VersionResponseSchema = z.object({
  version: z.string(),
  hash: z.string(),
  buildAt: z.string()
})
