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

const discordNotificationFields = {
  requestId: z.uuid(),
  postId: z.string().regex(/^\d+$/),
  postUrl: z.url().max(2000),
  managementUrl: z.url().max(2000),
  text: z.string().nonempty().max(20000),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().nonempty().max(500)).max(20),
  stores: z.array(z.string().nonempty().max(200)).max(20)
}
export const eventDetectionNotificationSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...discordNotificationFields, status: z.literal('held') }),
  z.strictObject({
    ...discordNotificationFields,
    status: z.literal('registered'),
    event: z.strictObject({
      title: z.string().nonempty().max(300),
      url: z.url().max(2000),
      category: z.string().nonempty().max(50),
      startDate: z.string().nonempty().max(100),
      endDate: z.string().nonempty().max(100).optional(),
      conditions: z.array(z.string().nonempty().max(300)).max(20)
    })
  })
])
export type EventDetectionNotification = z.infer<typeof eventDetectionNotificationSchema>

export const discordFailureKindSchema = z.enum([
  'configuration',
  'invalid_input',
  'authentication',
  'authorization',
  'rate_limit',
  'rejected',
  'upstream',
  'unexpected_response',
  'network',
  'rpc'
])
export type DiscordFailureKind = z.infer<typeof discordFailureKindSchema>
export const discordDeliveryResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('sent'), messageId: z.string().regex(/^\d+$/) }),
  z.strictObject({
    status: z.literal('failed'),
    kind: discordFailureKindSchema,
    statusCode: z.number().int().min(100).max(599).optional(),
    retryAfterSeconds: z.number().positive().max(86400).optional()
  }),
  z.strictObject({ status: z.literal('unknown'), kind: z.literal('delivery_unknown') })
])
export type DiscordDeliveryResult = z.infer<typeof discordDeliveryResultSchema>
export const discordTestRequestSchema = z.strictObject({ requestId: z.uuid() })
export type DiscordTestRequest = z.infer<typeof discordTestRequestSchema>
export const discordStatusSchema = z.strictObject({
  configFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  configured: z.strictObject({ token: z.boolean(), channel: z.boolean() }),
  settings: z.strictObject({
    token: z.enum(['missing', 'invalid', 'valid']),
    channel: z.enum(['missing', 'invalid', 'valid'])
  }),
  notificationsEnabled: z.boolean(),
  xPostingEnabled: z.boolean(),
  discordPostingEnabled: z.boolean().default(false),
  timelineNotificationsEnabled: z.boolean(),
  connection: z.enum([
    'unchecked',
    'unconfigured',
    'connected',
    'authentication',
    'authorization',
    'rate_limit',
    'network',
    'upstream',
    'unexpected_response'
  ]),
  bot: z.strictObject({ id: z.string().regex(/^\d+$/), username: z.string().nonempty().max(200) }).nullable(),
  channel: z.strictObject({ id: z.string().regex(/^\d+$/), name: z.string().nonempty().max(200) }).nullable(),
  sendPermission: z.enum(['unknown', 'allowed', 'denied']),
  errorKind: discordFailureKindSchema.nullable(),
  fetchedAt: z.iso.datetime()
})
export type DiscordStatus = z.infer<typeof discordStatusSchema>
