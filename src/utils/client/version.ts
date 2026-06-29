import { makeApi } from '@zodios/core'
import { z } from 'zod'

/**
 * バージョン情報レスポンススキーマ
 */
export const VersionResponseSchema = z.object({
  version: z.string(),
  hash: z.string(),
  buildAt: z.string()
})

export const versionEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/version',
    alias: 'getVersion',
    description: 'アプリのバージョン情報を取得（認証不要）',
    response: VersionResponseSchema
  }
])
