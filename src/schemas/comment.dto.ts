import { z } from '@hono/zod-openapi'

/**
 * コメント投稿リクエストスキーマ
 */
export const CreateCommentRequestSchema = z
  .object({
    nickname: z
      .string()
      .min(1, 'ニックネームは必須です')
      .max(20, 'ニックネームは 20 文字以内で入力してください')
      .openapi({ description: 'ニックネーム（1〜20文字）', example: 'たろう' }),
    body: z
      .string()
      .min(1, 'コメントは必須です')
      .max(200, 'コメントは 200 文字以内で入力してください')
      .openapi({ description: 'コメント本文（1〜200文字）', example: 'イベント楽しみにしています！' }),
    turnstileToken: z
      .string()
      .min(1, 'Turnstileトークンは必須です')
      .openapi({ description: 'Cloudflare Turnstile 検証トークン' })
  })
  .openapi('CreateCommentRequest')

export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>

/**
 * コメントレスポンススキーマ
 */
export const CommentResponseSchema = z
  .object({
    id: z.string().uuid().openapi({ description: 'コメントID', example: '550e8400-e29b-41d4-a716-446655440000' }),
    nickname: z.string().openapi({ description: 'ニックネーム', example: 'たろう' }),
    body: z.string().openapi({ description: 'コメント本文', example: 'イベント楽しみにしています！' }),
    createdAt: z.string().datetime().openapi({ description: '投稿日時', example: '2026-05-02T07:00:00.000Z' })
  })
  .openapi('CommentResponse')

export type CommentResponse = z.infer<typeof CommentResponseSchema>

/**
 * コメント一覧レスポンススキーマ
 */
export const ListCommentsResponseSchema = z.array(CommentResponseSchema).openapi('ListCommentsResponse')

export type ListCommentsResponse = z.infer<typeof ListCommentsResponseSchema>
