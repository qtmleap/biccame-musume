import { z } from 'zod'

/**
 * 経路区間のスキーマ
 */
export const LegSchema = z.object({
  from: z.string().nonempty(),
  to: z.string().nonempty(),
  fromStation: z.string().nonempty(),
  toStation: z.string().nonempty()
})

/**
 * リクエストスキーマ
 */
export const RouteRequestSchema = z.object({
  legs: z.array(LegSchema).nonempty().max(5)
})

/**
 * 路線区間のスキーマ
 */
export const RouteSegmentSchema = z.object({
  operator: z.string().nonempty(),
  line: z.string().nonempty(),
  from: z.string().nonempty(),
  to: z.string().nonempty(),
  duration: z.number()
})

/**
 * LLMからの応答の経路区間スキーマ
 */
export const LegResponseSchema = z.object({
  from: z.string().nonempty(),
  to: z.string().nonempty(),
  fromStation: z.string().nonempty(),
  toStation: z.string().nonempty(),
  routes: z.array(RouteSegmentSchema).nonempty(),
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
export type RouteSegment = z.infer<typeof RouteSegmentSchema>
export type LegResponse = z.infer<typeof LegResponseSchema>
export type RouteResponse = z.infer<typeof RouteResponseSchema>
