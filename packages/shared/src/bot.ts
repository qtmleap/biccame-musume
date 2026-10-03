import { z } from 'zod'

export const botPingRequestSchema = z.strictObject({ requestId: z.string().nonempty().max(128) })
export const botPingResponseSchema = z.strictObject({
  requestId: z.string().nonempty().max(128),
  service: z.literal('bot'),
  phase: z.literal('timeline'),
  notificationsEnabled: z.literal(false)
})

export type BotPingRequest = z.infer<typeof botPingRequestSchema>
export type BotPingResponse = z.infer<typeof botPingResponseSchema>

export interface BotRpc {
  ping(input: BotPingRequest): Promise<BotPingResponse>
}
