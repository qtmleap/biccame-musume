import { discordStatusSchema } from '@biccame/shared/bot'
import { ClefModelSchema } from '@biccame/shared/event-detect/clef'
import { FieldThresholdsSchema } from '@biccame/shared/event-detect/detection'
import { WebhookConfigurationSchema } from '@biccame/shared/schemas/webhook.dto'
import { z } from 'zod'

export const AdminBotStatusSchema = z.object({
  fetchedAt: z.iso.datetime(),
  botConnected: z.boolean(),
  discord: discordStatusSchema.nullable(),
  webhook: WebhookConfigurationSchema,
  error: z.string().nonempty().nullable()
})
export type AdminBotStatus = z.infer<typeof AdminBotStatusSchema>

export const AdminBotConfigurationRequestSchema = z.strictObject({
  model: ClefModelSchema,
  fieldThresholds: FieldThresholdsSchema
})
export const AdminBotConfigurationResponseSchema = z.strictObject({
  model: ClefModelSchema,
  fieldThresholds: FieldThresholdsSchema
})
export const AdminBotConfigurationErrorSchema = z.strictObject({ error: z.literal('configuration_unavailable') })
export type AdminBotConfigurationRequest = z.infer<typeof AdminBotConfigurationRequestSchema>
