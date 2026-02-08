import { z } from '@hono/zod-openapi'

/**
 * ユーザー作成/更新リクエストスキーマ
 */
export const UpsertUserRequestSchema = z
  .object({
    id: z.string().openapi({ description: 'ユーザーID' }),
    displayName: z.string().nullable().optional().openapi({ description: '表示名' }),
    thumbnailURL: z.string().nullable().optional().openapi({ description: 'プロフィール画像URL' }),
    screenName: z.string().nullable().optional().openapi({ description: 'Twitterスクリーンネーム' }),
    email: z.string().nullable().optional().openapi({ description: 'メールアドレス' })
  })
  .openapi('UpsertUserRequest')

/**
 * ユーザーレスポンススキーマ
 */
export const UserResponseSchema = z
  .object({
    id: z.string().openapi({ description: 'ユーザーID' }),
    displayName: z.string().nullable().openapi({ description: '表示名' }),
    thumbnailURL: z.string().nullable().openapi({ description: 'プロフィール画像URL' }),
    screenName: z.string().nullable().openapi({ description: 'Twitterスクリーンネーム' }),
    email: z.string().nullable().openapi({ description: 'メールアドレス' })
  })
  .openapi('UserResponse')

export type UpsertUserRequest = z.infer<typeof UpsertUserRequestSchema>
export type UserResponse = z.infer<typeof UserResponseSchema>
