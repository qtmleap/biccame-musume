import { type BotPingResponse, botPingRequestSchema, botPingResponseSchema } from '@biccame/shared/bot'

export const pingBot = (input: unknown): BotPingResponse => {
  const parsed = botPingRequestSchema.safeParse(input)
  if (!parsed.success) throw new Error('Invalid bot ping request')
  const result = botPingResponseSchema.safeParse({
    requestId: parsed.data.requestId,
    service: 'bot',
    phase: 'skeleton',
    notificationsEnabled: false
  })
  if (!result.success) throw new Error('Invalid bot ping response')
  return result.data
}
