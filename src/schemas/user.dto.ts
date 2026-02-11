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

/**
 * ユーザー情報レスポンス（client用）
 * Zodiosクライアント用にopenapiメソッドを使わないバージョン
 */
export const UserResponseSchemaForClient = z.object({
  id: z.string().nonempty(),
  displayName: z.string().nonempty().nullable(),
  photoUrl: z.string().nonempty().nullable(),
  screenName: z.string().nonempty().nullable(),
  email: z.string().nonempty().nullable()
})

/**
 * ユーザー作成/更新リクエスト（client用）
 */
export const UpsertUserRequestSchemaForClient = z.object({
  id: z.string().nonempty(),
  displayName: z.string().nonempty().nullish(),
  photoUrl: z.string().nonempty().nullish(),
  screenName: z.string().nonempty().nullish(),
  email: z.string().nonempty().nullish()
})

export type UpsertUserRequest = z.infer<typeof UpsertUserRequestSchema>
export type UserResponse = z.infer<typeof UserResponseSchema>
export type UserResponseForClient = z.infer<typeof UserResponseSchemaForClient>
export type UpsertUserRequestForClient = z.infer<typeof UpsertUserRequestSchemaForClient>
