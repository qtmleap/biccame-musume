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

/**
 * 管理画面のユーザー一覧 1 件分
 */
export const AdminUserSchema = z
  .object({
    id: z.string().nonempty().openapi({ description: 'Firebase UID' }),
    displayName: z.string().nonempty().nullable().openapi({ description: '表示名' }),
    email: z.string().nonempty().nullable().openapi({ description: 'メールアドレス' }),
    thumbnailURL: z.string().nonempty().nullable().openapi({ description: 'プロフィール画像URL' }),
    createdAt: z.string().nonempty().openapi({ description: '登録日時' })
  })
  .openapi('AdminUser')

export const AdminUserListResponseSchema = z
  .object({
    users: z.array(AdminUserSchema)
  })
  .openapi('AdminUserListResponse')

export const AdminUserSchemaForClient = z.object({
  id: z.string().nonempty(),
  displayName: z.string().nonempty().nullable(),
  email: z.string().nonempty().nullable(),
  thumbnailURL: z.string().nonempty().nullable(),
  createdAt: z.string().nonempty()
})

export const AdminUserListResponseSchemaForClient = z.object({
  users: z.array(AdminUserSchemaForClient)
})
