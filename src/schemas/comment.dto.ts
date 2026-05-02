import { z } from '@hono/zod-openapi'

/**
 * コメント投稿リクエストスキーマ
 */
export const CreateCommentRequestSchema = z
  .object({
    characterId: z
      .string()
      .min(1, 'キャラクターを選択してください')
      .openapi({ description: '選択したビッカメ娘キャラクター ID', example: 'abeno' }),
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
    characterId: z.string().openapi({ description: '投稿者が選んだキャラクター ID', example: 'abeno' }),
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
