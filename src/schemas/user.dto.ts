import { z } from '@hono/zod-openapi'

/**
 * ユーザーレスポンススキーマ
 */
export const UserResponseSchema = z
  .object({
    id: z.string().nonempty('ユーザーIDは必須です').openapi({ description: 'ユーザーID' }),
    displayName: z.string().nonempty().nullable().openapi({ description: '表示名' }),
    thumbnailURL: z.string().nonempty().nullable().openapi({ description: 'プロフィール画像URL' }),
    screenName: z.string().nonempty().nullable().openapi({ description: 'Twitterスクリーンネーム' }),
    email: z.string().nonempty().nullable().openapi({ description: 'メールアドレス' })
  })
  .openapi('UserResponse')

/**
 * ユーザー情報レスポンス（client用）
 * Zodiosクライアント用にopenapiメソッドを使わないバージョン
 */
export const UserResponseSchemaForClient = z.object({
  id: z.string().nonempty('ユーザーIDは必須です'),
  displayName: z.string().nonempty('表示名は必須です').nullable(),
  thumbnailURL: z.string().nonempty('プロフィール画像URLは必須です').nullable(),
  screenName: z.string().nonempty('スクリーンネームは必須です').nullable(),
  email: z.string().nonempty('メールアドレスは必須です').nullable()
})
