import { z } from '@hono/zod-openapi'

export const AdminTwitterAccountSchema = z
  .object({
    restId: z.string().nonempty().openapi({ description: 'X 内部の数値ID (rest_id)' }),
    screenName: z.string().nonempty().openapi({ description: '@ なしのスクリーンネーム' }),
    name: z.string().openapi({ description: '表示名' }),
    followersCount: z.number().int().nonnegative().openapi({ description: 'フォロワー数' }),
    friendsCount: z.number().int().nonnegative().openapi({ description: 'フォロー数' }),
    statusesCount: z.number().int().nonnegative().openapi({ description: '累計ツイート数' }),
    createdAt: z.string().openapi({ description: 'アカウント作成日時 (X 形式の文字列)' }),
    profileImageUrl: z.string().openapi({ description: 'プロフィール画像URL' }),
    description: z.string().openapi({ description: 'プロフィール文' })
  })
  .openapi('AdminTwitterAccount')

export const AdminTwitterStatusResponseSchema = z
  .object({
    ok: z.boolean().openapi({ description: '取得が成功したか' }),
    account: AdminTwitterAccountSchema.nullable().openapi({ description: '成功時のアカウント情報' }),
    error: z.string().nullable().openapi({ description: '失敗時のエラーメッセージ' }),
    fetchedAt: z.string().datetime().openapi({ description: '取得試行時刻' })
  })
  .openapi('AdminTwitterStatusResponse')

export type AdminTwitterStatusResponse = z.infer<typeof AdminTwitterStatusResponseSchema>
