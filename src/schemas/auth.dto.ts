import { z } from 'zod'

/**
 * 認証成功レスポンススキーマ
 */
export const AuthResponseSchema = z.object({
  success: z.boolean()
})

/**
 * 現在のユーザーレスポンススキーマ
 */
export const CurrentUserResponseSchema = z.object({
  id: z.string().nonempty(),
  displayName: z.string().nonempty().nullable(),
  thumbnailURL: z.string().nonempty().nullable(),
  screenName: z.string().nonempty().nullable(),
  email: z.string().nonempty().nullable()
})

