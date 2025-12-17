import { z } from 'zod'

/**
 * 投票リクエストスキーマ
 */
export const VoteRequestSchema = z.object({
  characterId: z.string().nonempty()
})

export type VoteRequest = z.infer<typeof VoteRequestSchema>

/**
 * 投票レスポンススキーマ
 */
export const VoteResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  count: z.number().optional(),
  nextVoteDate: z.string().optional() // JST の次の日付
})

export type VoteResponse = z.infer<typeof VoteResponseSchema>

/**
 * 投票カウントスキーマ
 */
export const VoteCountSchema = z.object({
  characterId: z.string(),
  count: z.number()
})

export type VoteCount = z.infer<typeof VoteCountSchema>
