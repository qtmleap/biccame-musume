import { z } from 'zod'

export const botPingRequestSchema = z.strictObject({ requestId: z.string().nonempty().max(128) })
export const botPingResponseSchema = z.strictObject({
  requestId: z.string().nonempty().max(128),
  service: z.literal('bot'),
  phase: z.literal('posting'),
  notificationsEnabled: z.boolean()
})
export type BotPingRequest = z.infer<typeof botPingRequestSchema>
export type BotPingResponse = z.infer<typeof botPingResponseSchema>

export const announcementSchema = z.strictObject({
  eventUUID: z.uuid(),
  revision: z.iso.datetime(),
  purpose: z.enum(['created', 'updated']),
  text: z.string().nonempty().max(10000),
  quoteTweetId: z.string().regex(/^\d+$/).optional()
})
export type Announcement = z.infer<typeof announcementSchema>
export const deliveryResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('sent'), tweetId: z.string().regex(/^\d+$/) }),
  z.strictObject({ status: z.literal('disabled') }),
  z.strictObject({
    status: z.enum(['failed', 'unknown']),
    kind: z.enum([
      'configuration',
      'signature',
      'authentication',
      'account_mismatch',
      'authorization',
      'upstream',
      'delivery_unknown',
      'rate_limit',
      'rejected',
      'unexpected_response',
      'network',
      'rpc'
    ])
  })
])
export type DeliveryResult = z.infer<typeof deliveryResultSchema>

export const accountSchema = z.strictObject({
  restId: z.string().nonempty(),
  screenName: z.string().nonempty(),
  name: z.string().max(1000),
  followersCount: z.number().int().nonnegative(),
  friendsCount: z.number().int().nonnegative(),
  statusesCount: z.number().int().nonnegative(),
  favouritesCount: z.number().int().nonnegative(),
  listedCount: z.number().int().nonnegative(),
  mediaCount: z.number().int().nonnegative(),
  createdAt: z.string().nonempty(),
  profileImageUrl: z.string().max(10000),
  profileBannerUrl: z.string().max(10000).nullable(),
  description: z.string().max(10000)
})
export const accountResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), account: accountSchema }),
  z.strictObject({
    ok: z.literal(false),
    kind: z.enum(['disabled', 'configuration', 'authentication', 'rate_limit', 'network', 'unexpected_response'])
  })
])
export type AccountResult = z.infer<typeof accountResultSchema>
export const dailyRequestSchema = z.strictObject({ scheduledAt: z.iso.datetime() })
export type DailyRequest = z.infer<typeof dailyRequestSchema>
const dailyGroupSchema = z.strictObject({
  eventUUIDs: z.array(z.uuid()),
  texts: z.array(z.string().nonempty().max(10000))
})
export const dailyTargetsSchema = z.strictObject({
  scheduledAt: z.iso.datetime(),
  starting: dailyGroupSchema,
  ending: dailyGroupSchema
})
export type DailyTargets = z.infer<typeof dailyTargetsSchema>
export const dailyTargetsResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), targets: dailyTargetsSchema }),
  z.strictObject({ ok: z.literal(false), kind: z.enum(['disabled', 'unavailable']) })
])
export type DailyTargetsResult = z.infer<typeof dailyTargetsResultSchema>

export const postingSessionResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    kind: z.enum([
      'disabled',
      'configuration',
      'authentication',
      'authorization',
      'account_mismatch',
      'signature',
      'rate_limit',
      'network',
      'upstream',
      'unexpected_response'
    ])
  })
])
export type PostingSessionResult = z.infer<typeof postingSessionResultSchema>

export interface BotRpc {
  ping(input: BotPingRequest): Promise<BotPingResponse>
  announce(input: Announcement): Promise<DeliveryResult>
  accountStatus(): Promise<AccountResult>
  postingSessionStatus(): Promise<PostingSessionResult>
}
export interface AppBotReadRpc {
  dailyTargets(input: DailyRequest): Promise<DailyTargetsResult>
}
