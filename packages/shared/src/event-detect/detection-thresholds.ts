import { z } from 'zod'

export const DEFAULT_DETECTION_THRESHOLDS = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 } as const

/** 項目別にしきい値を持てる質問。is_event（eventThreshold・参考値）と ignoreThreshold は別設定で、ここには含めない。対象ビッカメ娘（character）は共通値 fieldThreshold を使う。 */
export const FIELD_THRESHOLD_KEYS = [
  'status',
  'category',
  'store',
  'start_date',
  'end_date',
  'quantity',
  'condition',
  'purchase_amount'
] as const
export type FieldThresholdKey = (typeof FIELD_THRESHOLD_KEYS)[number]
/** 状態（status）の既定のしきい値の上限。Clef は告知を 0.85 前後で止めることが多く、共通値 0.9 だと保留になるため下げる。 */
export const STATUS_DEFAULT_THRESHOLD = 0.8
const FieldThresholdSchema = z.number().positive().max(1)
/** 8項目すべての有効なしきい値。保存・API の形で、1項目でも欠ける・余分なキーがあると不正。 */
export const FieldThresholdsSchema = z.strictObject({
  status: FieldThresholdSchema,
  category: FieldThresholdSchema,
  store: FieldThresholdSchema,
  start_date: FieldThresholdSchema,
  end_date: FieldThresholdSchema,
  quantity: FieldThresholdSchema,
  condition: FieldThresholdSchema,
  purchase_amount: FieldThresholdSchema
} satisfies Record<FieldThresholdKey, typeof FieldThresholdSchema>)
export type FieldThresholds = z.infer<typeof FieldThresholdsSchema>

export const DetectionThresholdsSchema = z
  .strictObject({
    // eventThreshold と ignoreThreshold は is_event の参考値用。v13 以降の登録・保留・対象外の判定には使わない
    // （対象外は店舗とビッカメ娘の両方が none のときだけ）。保存済みの設定との互換のため、スキーマには残す。
    eventThreshold: z.number().positive().max(1),
    fieldThreshold: z.number().positive().max(1),
    ignoreThreshold: z.number().min(0).max(1),
    /** 項目別の上書き（任意）。無い項目は resolveFieldThresholds の既定値。 */
    fieldThresholds: FieldThresholdsSchema.partial().optional()
  })
  .refine((value) => value.ignoreThreshold < value.eventThreshold, { message: 'Invalid detection thresholds' })
export type DetectionThresholds = z.infer<typeof DetectionThresholdsSchema>

/**
 * 項目ごとの有効なしきい値。上書きがあればそれ、無ければ既定値。
 * 既定値は status が min(fieldThreshold, STATUS_DEFAULT_THRESHOLD)、他の7項目は fieldThreshold（従来の共通値）。
 */
export const resolveFieldThresholds = (
  fieldThreshold: number,
  overrides?: Partial<Record<FieldThresholdKey, number>>
): FieldThresholds => {
  const pick = (key: FieldThresholdKey, fallback: number): number => {
    const value = overrides === undefined ? undefined : overrides[key]
    return value === undefined ? fallback : value
  }
  return {
    status: pick('status', Math.min(fieldThreshold, STATUS_DEFAULT_THRESHOLD)),
    category: pick('category', fieldThreshold),
    store: pick('store', fieldThreshold),
    start_date: pick('start_date', fieldThreshold),
    end_date: pick('end_date', fieldThreshold),
    quantity: pick('quantity', fieldThreshold),
    condition: pick('condition', fieldThreshold),
    purchase_amount: pick('purchase_amount', fieldThreshold)
  }
}
const isFieldThresholdKey = (key: string): key is FieldThresholdKey =>
  FIELD_THRESHOLD_KEYS.some((value) => value === key)

/**
 * 質問キーに対するしきい値。is_event は eventThreshold、8項目は項目別の有効値、それ以外の未知のキーは fieldThreshold。
 * 判定（evaluateDetection）と管理画面の回答表（describeAnswers）が同じ関数で引き、判定と表示がずれないようにする。
 */
export const thresholdOf = (thresholds: DetectionThresholds, key: string): number => {
  if (key === 'is_event') return thresholds.eventThreshold
  // v3〜v12 の保存データの店舗・ビッカメ娘ごとの質問（venue.* / character.*）。
  if (key.startsWith('venue.'))
    return resolveFieldThresholds(thresholds.fieldThreshold, thresholds.fieldThresholds).store
  if (key.startsWith('character.')) return thresholds.fieldThreshold
  // v13 の対象ビッカメ娘（choice）。専用のしきい値キーは作らず（FieldThresholdsSchema は保存値の互換のため変えない）、共通値を使う。
  if (key === 'character') return thresholds.fieldThreshold
  if (!isFieldThresholdKey(key)) return thresholds.fieldThreshold
  return resolveFieldThresholds(thresholds.fieldThreshold, thresholds.fieldThresholds)[key]
}
