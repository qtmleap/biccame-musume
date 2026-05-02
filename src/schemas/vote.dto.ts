import { z } from '@hono/zod-openapi'

/**
 * 投票レスポンス（成功・エラー共通）
 */
export const VoteResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  message: z.string().nonempty('メッセージは必須です').openapi({ example: '投票ありがとうございます！' }),
  nextVoteDate: z.string().nonempty('次回投票日は必須です').openapi({ example: '2025-12-23' })
})

export type VoteResponse = z.infer<typeof VoteResponseSchema>

/**
 * 投票カウント項目
 */
export const VoteCountItemSchema = z.object({
  key: z.string().nonempty('キーは必須です').openapi({ example: 'honten' }),
  count: z.number().openapi({ example: 42 })
})


/**
 * 投票カウント一覧
 */
export const VoteCountListSchema = z.array(VoteCountItemSchema)
