import { makeApi } from '@zodios/core'
import { CurrentUserResponseSchema } from '@/schemas/auth.dto'
import { UserResponseSchemaForClient } from '@/schemas/user.dto'

export const usersEndpoints = makeApi([
  {
    method: 'get',
    path: '/api/me',
    alias: 'getCurrentUser',
    description: '現在ログイン中のユーザー情報を取得',
    response: CurrentUserResponseSchema
  },
  {
    method: 'get',
    path: '/api/users/:id',
    alias: 'getUser',
    description: 'ユーザー情報を取得',
    response: UserResponseSchemaForClient
  }
])
