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

/**
 * 判定の3つのしきい値（イベント判定の登録・必須項目の選択・対象外）。保存・API の形で、余分なキーは不正。
 * 対象外（ignoreThreshold）は 0 を許し、登録（eventThreshold）より小さくなければならない。環境変数の仕様と同じ規則。
 */
export const EventThresholdsSchema = z
  .strictObject({
    eventThreshold: z.number().positive().max(1),
    ignoreThreshold: z.number().min(0).max(1),
    choiceThreshold: z.number().positive().max(1)
  })
  .refine((value) => value.ignoreThreshold < value.eventThreshold, {
    path: ['ignoreThreshold'],
    message: 'ignoreThreshold must be lower than eventThreshold'
  })
export type EventThresholds = z.infer<typeof EventThresholdsSchema>

export const AdminBotConfigurationRequestSchema = z.strictObject({
  model: ClefModelSchema,
  thresholds: EventThresholdsSchema,
  fieldThresholds: FieldThresholdsSchema
})
export const AdminBotConfigurationResponseSchema = z.strictObject({
  model: ClefModelSchema,
  thresholds: EventThresholdsSchema,
  fieldThresholds: FieldThresholdsSchema
})
export const AdminBotConfigurationErrorSchema = z.strictObject({ error: z.literal('configuration_unavailable') })
export type AdminBotConfigurationRequest = z.infer<typeof AdminBotConfigurationRequestSchema>
