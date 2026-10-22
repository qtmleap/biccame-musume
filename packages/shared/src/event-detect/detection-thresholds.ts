import { z } from 'zod'
import { CHARACTER_CONFIRM_KEY, STORE_CONFIRM_KEY } from './associations'

export const DEFAULT_DETECTION_THRESHOLDS = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 } as const

/** 項目別にしきい値を持てる質問。is_event（eventThreshold・参考値）と ignoreThreshold は別設定で、ここには含めない。対象ビッカメ娘（character）は min(共通値 fieldThreshold, CHARACTER_DEFAULT_THRESHOLD) を使う。 */
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
/**
 * 開催店舗（store）の既定のしきい値の上限。選択肢が 46 個あり確率が散るため、90% を求めると登録が 0 件になる。
 * 最上位をそのまま採用する（none・multiple は選択として採用しない）ためのごく低い下限で、未保存のときの既定値にだけ使う。
 * 管理画面で保存された項目別のしきい値は、この値より優先する。
 */
export const STORE_DEFAULT_THRESHOLD = 0.3
/**
 * 対象ビッカメ娘（character）を採用する確率の上限（実際の下限は min(共通値, この値)）。選択肢が 55 個あり確率が散るため、最上位をそのまま採用する。
 * 項目別のしきい値のキーは保存値の互換のため増やせないので、専用の設定は持たず、共通値（管理画面の「必須項目の選択閾値」）を下げれば
 * それに従って下がる。none・multiple は採用しない。
 */
export const CHARACTER_DEFAULT_THRESHOLD = 0.3
/**
 * 2段目（確認）の「はい」の確率の下限（v16 以降）。1段目で最上位に選んだ店舗・娘を、この下限以上で「はい」と答えたときだけ確定する。
 * FieldThresholdsSchema は保存済みの設定との互換のためキーを増やせないので、管理画面の設定には含めず定数で持つ。
 * 0.7 は D1 の測定（正しい店舗の「はい」の 91% が通り、誤った店舗の 9% が通る）から決めた仮の値で、後続の測定で決め直す。
 */
export const STORE_CONFIRM_THRESHOLD = 0.7
export const CHARACTER_CONFIRM_THRESHOLD = 0.7
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
 * 既定値は status が min(fieldThreshold, STATUS_DEFAULT_THRESHOLD)、store が min(fieldThreshold, STORE_DEFAULT_THRESHOLD)、
 * 他の6項目は fieldThreshold（従来の共通値）。
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
    store: pick('store', Math.min(fieldThreshold, STORE_DEFAULT_THRESHOLD)),
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
 * 質問キーに対するしきい値。is_event は eventThreshold、8項目は項目別の有効値、確認の質問は定数、それ以外の未知のキーは fieldThreshold。
 * 判定（evaluateDetection）と管理画面の回答表（describeAnswers）が同じ関数で引き、判定と表示がずれないようにする。
 */
export const thresholdOf = (thresholds: DetectionThresholds, key: string): number => {
  if (key === 'is_event') return thresholds.eventThreshold
  // v3〜v12 の保存データの店舗・ビッカメ娘ごとの質問（venue.* / character.*）。noul なので共通値で表示する
  // （store の既定値は最上位採用のために下げてあり、noul の確定表示にそのまま使うと全て確定に見えるため）。
  if (key.startsWith('venue.') || key.startsWith('character.')) return thresholds.fieldThreshold
  // v13 以降の対象ビッカメ娘（choice）。専用のしきい値キーは作らず（FieldThresholdsSchema は保存値の互換のため変えない）、
  // 共通値と定数の小さい方（最上位採用）を使う。
  if (key === 'character') return Math.min(thresholds.fieldThreshold, CHARACTER_DEFAULT_THRESHOLD)
  // v16 以降の2段目（確認）の質問。設定に依らず定数で、evaluateDetection の関門と回答表の確定表示が同じ値を引く。
  if (key === STORE_CONFIRM_KEY) return STORE_CONFIRM_THRESHOLD
  if (key === CHARACTER_CONFIRM_KEY) return CHARACTER_CONFIRM_THRESHOLD
  if (!isFieldThresholdKey(key)) return thresholds.fieldThreshold
  return resolveFieldThresholds(thresholds.fieldThreshold, thresholds.fieldThresholds)[key]
}
