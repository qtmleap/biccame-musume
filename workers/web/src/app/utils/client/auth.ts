import { AuthResponseSchema } from '@biccame/shared/schemas/auth.dto'
import { makeApi } from '@zodios/core'

export const authEndpoints = makeApi([
  {
    method: 'post',
    path: '/api/auth',
    alias: 'authenticate',
    description: 'Firebase IDトークンで認証してセッションクッキーを設定',
    response: AuthResponseSchema
  },
  {
    method: 'post',
    path: '/api/auth/logout',
    alias: 'logout',
    description: 'ログアウトしてセッションクッキーを削除',
    response: AuthResponseSchema
  }
])
