import { z } from '@hono/zod-openapi'

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

/**
 * ユーザー情報レスポンス（client用）
 * Zodiosクライアント用にopenapiメソッドを使わないバージョン
 */
export const UserResponseSchemaForClient = z.object({
  id: z.string().nonempty(),
  displayName: z.string().nonempty().nullable(),
  thumbnailURL: z.string().nonempty().nullable(),
  screenName: z.string().nonempty().nullable(),
  email: z.string().nonempty().nullable()
})

