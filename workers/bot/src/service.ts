import { type BotPingResponse, botPingRequestSchema, botPingResponseSchema } from '@biccame/shared/bot'

export const pingBot = (input: unknown, notificationsEnabled = false): BotPingResponse => {
  const parsed = botPingRequestSchema.safeParse(input)
  if (!parsed.success) throw new Error('Invalid bot ping request')
  const result = botPingResponseSchema.safeParse({
    requestId: parsed.data.requestId,
    service: 'bot',
    phase: 'posting',
    notificationsEnabled
  })
  if (!result.success) throw new Error('Invalid bot ping response')
  return result.data
}
