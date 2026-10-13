import type { Bindings } from '@api/types/bindings'
import { ClefModelSchema } from '@biccame/shared/event-detect/clef'
import { FieldThresholdsSchema, resolveFieldThresholds } from '@biccame/shared/event-detect/detection'
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
/** 項目別しきい値（9項目すべての有効値の JSON）の保存先。モデルのキーとは別に持つ。 */
export const EVENT_DETECTION_FIELD_THRESHOLDS_KEY = 'settings:event-detection:field-thresholds'

/** 不正な JSON は例外にせず undefined（スキーマ違反と同じ扱い）にする。 */
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export const detectionConfiguration = async (env: Bindings) => {
  const [stored, storedThresholds] = await Promise.all([
    env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_MODEL_KEY, 'text'),
    env.BICCAME_MUSUME_EVENTS.get(EVENT_DETECTION_FIELD_THRESHOLDS_KEY, 'text')
  ])
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
  // 未保存なら既定値（共通値 choiceThreshold から決まる）。保存値が壊れていても保存内容は出さず、既定値に戻す。
  // 旧9項目の保存値から廃止したsingle_eventだけを削除する。他の8項目は保持する。
  const legacy = FieldThresholdsSchema.extend({ single_event: z.number().positive().max(1) }).safeParse(
    storedThresholds === null ? undefined : parseJson(storedThresholds)
  )
  const migrated = legacy.success
    ? (() => {
        const { single_event: _removed, ...fields } = legacy.data
        return fields
      })()
    : undefined
  // 保存は管理APIが新形式で行う。読み取り時には書かず、KVの古い読み取りで直近の設定を上書きしない。
  const thresholds =
    storedThresholds === null
      ? undefined
      : FieldThresholdsSchema.safeParse(migrated === undefined ? parseJson(storedThresholds) : migrated)
  if (thresholds !== undefined && !thresholds.success) {
    console.warn('Invalid stored event detection field thresholds; using defaults')
  }
  const fieldThresholds = thresholds?.success ? thresholds.data : resolveFieldThresholds(parsed.data.choiceThreshold)
  return { ...parsed.data, fieldThresholds }
}

export const webhookConfiguration = async (env: Bindings) => ({
  ...(await detectionConfiguration(env)),
  configured: Boolean(env.WEBHOOK_SECRET_KEY?.trim()),
  queueConfigured: env.EVENT_DETECTION_QUEUE !== undefined
})
