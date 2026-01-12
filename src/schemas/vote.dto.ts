import { z } from '@hono/zod-openapi'

/**
 * 投票リクエスト
 */
export const VoteRequestSchema = z.object({
  characterId: z.string().min(1).openapi({ example: 'biccame-001' })
})

export type VoteRequest = z.infer<typeof VoteRequestSchema>

/**
 * 投票レスポンス（成功・エラー共通）
 */
export const VoteResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  message: z.string().openapi({ example: '投票ありがとうございます！' }),
  nextVoteDate: z.string().openapi({ example: '2025-12-23' })
})

export type VoteResponse = z.infer<typeof VoteResponseSchema>

/**
 * 投票カウント項目
 */
export const VoteCountItemSchema = z.object({
  key: z.string().openapi({ example: 'honten' }),
  count: z.number().openapi({ example: 42 })
})

export type VoteCountItem = z.infer<typeof VoteCountItemSchema>

/**
 * 投票カウント一覧
 */
export const VoteCountListSchema = z.array(VoteCountItemSchema)

export type VoteCountList = z.infer<typeof VoteCountListSchema>
