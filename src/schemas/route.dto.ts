import { z } from 'zod'

/**
 * 経路区間のスキーマ
 */
export const LegSchema = z.object({
  from: z.string(),
  to: z.string(),
  fromStation: z.string(),
  toStation: z.string()
})

/**
 * リクエストスキーマ
 */
export const RouteRequestSchema = z.object({
  legs: z.array(LegSchema)
})

/**
 * LLMからの応答の経路区間スキーマ
 */
export const LegResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  fromStation: z.string(),
  toStation: z.string(),
  lines: z.array(z.string()),
  duration: z.number(),
  transfers: z.number()
})

/**
 * LLMからの応答スキーマ
 */
export const RouteResponseSchema = z.object({
  legs: z.array(LegResponseSchema)
})

export type Leg = z.infer<typeof LegSchema>
export type RouteRequest = z.infer<typeof RouteRequestSchema>
export type LegResponse = z.infer<typeof LegResponseSchema>
export type RouteResponse = z.infer<typeof RouteResponseSchema>
