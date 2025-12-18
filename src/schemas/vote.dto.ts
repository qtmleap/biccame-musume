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
  message: z.string().nonempty(),
  count: z.number().min(0),
  nextVoteDate: z.coerce.date() // JST の次の日付
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

/**
 * 全投票カウントスキーマ
 */
export const AllVoteCountsSchema = z.record(z.string(), z.number())

export type AllVoteCounts = z.infer<typeof AllVoteCountsSchema>
