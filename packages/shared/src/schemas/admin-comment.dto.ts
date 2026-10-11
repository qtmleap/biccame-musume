import { z } from '@hono/zod-openapi'

export const AdminCommentSchema = z
  .object({
    id: z.uuid().openapi({ description: 'コメントID' }),
    eventId: z.uuid().openapi({ description: 'イベントID' }),
    eventTitle: z.string().nonempty().openapi({ description: 'イベント名' }),
    characterId: z.string().nonempty().openapi({ description: '投稿者キャラクターID' }),
    body: z.string().nonempty().openapi({ description: 'コメント本文' }),
    ipAddress: z.string().nonempty().openapi({ description: '投稿者IP' }),
    userId: z.string().nonempty().nullable().openapi({ description: 'Firebase UID（ログイン投稿時のみ）' }),
    deletedAt: z.string().datetime().nullable().openapi({ description: '論理削除日時（未削除なら null）' }),
    createdAt: z.string().datetime().openapi({ description: '投稿日時' })
  })
  .openapi('AdminComment')

export type AdminComment = z.infer<typeof AdminCommentSchema>

export const AdminCommentsResponseSchema = z
  .object({
    comments: z.array(AdminCommentSchema)
  })
  .openapi('AdminCommentsResponse')

export const AdminCommentsQuerySchema = z.object({
  includeDeleted: z
    .union([z.literal('1'), z.literal('0')])
    .optional()
    .openapi({ description: '削除済みコメントを含める (1=含める)' })
})
