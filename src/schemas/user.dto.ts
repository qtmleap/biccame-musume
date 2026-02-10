import { z } from '@hono/zod-openapi'

/**
 * ユーザー作成/更新リクエストスキーマ
 * Firebase認証トークンから取得できない情報のみ受け取る
 */
export const UpsertUserRequestSchema = z
  .object({
    // screenName: z.string().openapi({ description: 'Twitterスクリーンネーム' })
  })
  .openapi('UpsertUserRequest')

/**
 * ユーザーレスポンススキーマ
 */
export const UserResponseSchema = z
  .object({
    id: z.string().nonempty().openapi({ description: 'ユーザーID' }),
    displayName: z.string().nullable().openapi({ description: '表示名' }),
    thumbnailURL: z.string().nullable().openapi({ description: 'プロフィール画像URL' }),
    screenName: z.string().nullable().openapi({ description: 'Twitterスクリーンネーム' }),
    email: z.string().nullable().openapi({ description: 'メールアドレス' })
  })
  .openapi('UserResponse')

export type UpsertUserRequest = z.infer<typeof UpsertUserRequestSchema>
export type UserResponse = z.infer<typeof UserResponseSchema>
