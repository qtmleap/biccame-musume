import { VersionResponseSchema } from '@biccame/shared/schemas/version.dto'
import { makeApi } from '@zodios/core'

export { VersionResponseSchema } from '@biccame/shared/schemas/version.dto'

export const versionEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/version',
    alias: 'getVersion',
    description: 'アプリのバージョン情報を取得（認証不要）',
    response: VersionResponseSchema
  }
])
