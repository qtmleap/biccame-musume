import { z } from '@hono/zod-openapi'

/**
 * 投票リクエストスキーマ
 */
export const VoteRequestSchema = z.object({
  characterId: z.string().min(1).openapi({ example: 'biccame-001' })
})

export type VoteRequest = z.infer<typeof VoteRequestSchema>

/**
 * 投票レスポンススキーマ
 */
export const VoteResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  message: z.string().min(1).openapi({ example: '投票ありがとうございます！' }),
  count: z.number().min(0).openapi({ example: 42 }),
  nextVoteDate: z.coerce.date().openapi({ example: '2025-12-23' }) // JST の次の日付
})

export type VoteResponse = z.infer<typeof VoteResponseSchema>

/**
 * 投票カウントスキーマ
 */
export const VoteCountSchema = z.object({
  characterId: z.string().openapi({ example: 'biccame-001' }),
  count: z.number().openapi({ example: 42 })
})

export type VoteCount = z.infer<typeof VoteCountSchema>

/**
 * 投票成功レスポンススキーマ
 */
export const VoteSuccessResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  message: z.string().openapi({ example: '投票ありがとうございます！' }),
  count: z.number().openapi({ example: 43 }),
  nextVoteDate: z.string().openapi({ example: '2025-12-23' })
})

export type VoteSuccessResponse = z.infer<typeof VoteSuccessResponseSchema>

/**
 * 投票エラーレスポンススキーマ
 */
export const VoteErrorResponseSchema = z.object({
  success: z.boolean().openapi({ example: false }),
  message: z.string().openapi({ example: 'Invalid request' }),
  nextVoteDate: z.string().optional().openapi({ example: '2025-12-23' })
})

export type VoteErrorResponse = z.infer<typeof VoteErrorResponseSchema>

/**
 * 全投票カウントスキーマ
 */
export const AllVoteCountsSchema = z.record(z.string(), z.number())

export type AllVoteCounts = z.infer<typeof AllVoteCountsSchema>
