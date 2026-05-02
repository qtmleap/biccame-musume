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
  id: z.string().nonempty('ユーザーIDは必須です'),
  displayName: z.string().nonempty('表示名は必須です').nullable(),
  thumbnailURL: z.string().nonempty('プロフィール画像URLは必須です').nullable(),
  screenName: z.string().nonempty('スクリーンネームは必須です').nullable(),
  email: z.string().nonempty('メールアドレスは必須です').nullable()
})
