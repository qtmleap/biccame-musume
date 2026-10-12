import type { Bindings } from '@api/types/bindings'
import { ClefModelSchema } from '@biccame/shared/event-detect/clef'
import { z } from 'zod'

const ProbabilitySchema = z.coerce.number().min(0).max(1)
const ConfigSchema = z
  .object({
    model: ClefModelSchema.default('clef'),
    eventThreshold: ProbabilitySchema.positive().default(0.9),
    ignoreThreshold: ProbabilitySchema.default(0.5),
    choiceThreshold: ProbabilitySchema.positive().default(0.9)
  })
  .refine((value) => value.ignoreThreshold < value.eventThreshold)

export const EVENT_DETECTION_MODEL_KEY = 'settings:event-detection:model'

export const detectionConfiguration = async (env: Bindings) => {
  const stored = await env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_MODEL_KEY, 'text')
  const model = ClefModelSchema.safeParse(stored)
  if (stored !== null && !model.success) {
    console.warn('Invalid stored event detection model; using environment configuration')
  }
  const parsed = ConfigSchema.safeParse({
    model: model.success ? model.data : env.EVENT_DETECTION_MODEL,
    eventThreshold: env.EVENT_DETECTION_THRESHOLD,
    ignoreThreshold: env.EVENT_DETECTION_IGNORE_THRESHOLD,
    choiceThreshold: env.EVENT_DETECTION_CHOICE_THRESHOLD
  })
  if (!parsed.success) throw new Error('Invalid event detection configuration')
  return parsed.data
}

export const webhookConfiguration = async (env: Bindings) => ({
  ...(await detectionConfiguration(env)),
  configured: Boolean(env.WEBHOOK_SECRET_KEY?.trim()),
  queueConfigured: env.EVENT_DETECTION_QUEUE !== undefined
})
