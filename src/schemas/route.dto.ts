import { z } from '@hono/zod-openapi'

/**
 * 経路区間のスキーマ
 */
export const LegSchema = z
  .object({
    from: z.string().nonempty().openapi({ description: '出発店舗名' }),
    to: z.string().nonempty().openapi({ description: '到着店舗名' }),
    fromStation: z.string().nonempty().openapi({ description: '出発駅名' }),
    toStation: z.string().nonempty().openapi({ description: '到着駅名' })
  })
  .openapi('Leg')

/**
 * リクエストスキーマ
 */
export const RouteRequestSchema = z
  .object({
    legs: z.array(LegSchema).nonempty().max(5).openapi({ description: '経路区間の配列（最大5件）' })
  })
  .openapi('RouteRequest')

/**
 * 路線区間のスキーマ
 */
export const RouteSegmentSchema = z
  .object({
    operator: z.string().nonempty().openapi({ description: '経営母体（例: JR西日本、近鉄）' }),
    line: z.string().nonempty().openapi({ description: '路線名（例: 京都線、御堂筋線）' }),
    from: z.string().nonempty().openapi({ description: '乗車駅' }),
    to: z.string().nonempty().openapi({ description: '下車駅' }),
    duration: z.number().openapi({ description: '所要時間（分）' })
  })
  .openapi('RouteSegment')

/**
 * LLMからの応答の経路区間スキーマ
 */
export const LegResponseSchema = z
  .object({
    from: z.string().nonempty().openapi({ description: '出発店舗名' }),
    to: z.string().nonempty().openapi({ description: '到着店舗名' }),
    fromStation: z.string().nonempty().openapi({ description: '出発駅名' }),
    toStation: z.string().nonempty().openapi({ description: '到着駅名' }),
    routes: z.array(RouteSegmentSchema).nonempty().openapi({ description: '利用する路線区間の配列' }),
    duration: z.number().openapi({ description: '総所要時間（分）' }),
    transfers: z.number().openapi({ description: '乗り換え回数' })
  })
  .openapi('LegResponse')

/**
 * LLMからの応答スキーマ
 */
export const RouteResponseSchema = z
  .object({
    legs: z.array(LegResponseSchema).openapi({ description: '経路情報の配列' })
  })
  .openapi('RouteResponse')

export type Leg = z.infer<typeof LegSchema>
export type RouteRequest = z.infer<typeof RouteRequestSchema>
export type RouteSegment = z.infer<typeof RouteSegmentSchema>
export type LegResponse = z.infer<typeof LegResponseSchema>
export type RouteResponse = z.infer<typeof RouteResponseSchema>
