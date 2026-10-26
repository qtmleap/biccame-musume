import { z } from 'zod'
import { CHARACTER_CONFIRM_KEY, CHARACTER_QUESTION_KEY, STORE_CONFIRM_KEY, STORE_QUESTION_KEY } from './associations'

export const DEFAULT_DETECTION_THRESHOLDS = { eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 } as const

/**
 * 項目別にしきい値を持つ質問（保存・API の形）。回答表（answer-view.ts の QUESTION_LABELS）の質問の順で、is_event と single_event は含めない。
 * is_event は「イベント判定の登録閾値」（eventThreshold）が別にあり、回答表にも出さない。single_event は廃止した項目
 * （webhook-config.ts が旧 9 項目の保存値から取り除く）。旧版の venue.* / character.*（noul）は共通値（fieldThreshold）を使う。
 */
export const FIELD_THRESHOLD_KEYS = [
  'status',
  'category',
  STORE_QUESTION_KEY,
  STORE_CONFIRM_KEY,
  CHARACTER_QUESTION_KEY,
  CHARACTER_CONFIRM_KEY,
  'start_date',
  'end_date',
  'quantity',
  'condition',
  'purchase_amount',
  'charge_amount'
] as const
export type FieldThresholdKey = (typeof FIELD_THRESHOLD_KEYS)[number]
/** 状態（status）の既定のしきい値の上限。Clef は告知を 0.85 前後で止めることが多く、共通値 0.9 だと保留になるため下げる。 */
export const STATUS_DEFAULT_THRESHOLD = 0.8
/**
 * 開催・配布店舗（store）の1段目の既定のしきい値。管理画面で保存した値が優先する。
 * 最上位の確率がこの値以上なら、2段目の確認を聞かずに確定（採用）する。未満なら 2 段目の確認を聞き、「はい」が STORE_CONFIRM_THRESHOLD 以上のときだけ確定する。
 * 選択肢が 46 個あり確率が散るため、共通値（90%）を求めると 1 段目だけでは確定せず、確認の呼び出しが増える。none・multiple は最上位でも店舗として採用しない。
 */
export const STORE_DEFAULT_THRESHOLD = 0.7
/**
 * 対象ビッカメ娘（character）の1段目の既定のしきい値。管理画面で保存した値が優先する。
 * 最上位の確率がこの値以上なら、2段目の確認を聞かずに明示として採用する。未満なら確認を聞き、「はい」が CHARACTER_CONFIRM_THRESHOLD 以上のときだけ明示として採用する。
 * 明示されなければ採用した店舗の娘になる（detection-character.ts）。none・multiple は採用しない。
 */
export const CHARACTER_DEFAULT_THRESHOLD = 0.7
/**
 * 2段目（確認）の「はい」の確率の既定のしきい値（v16 以降）。管理画面で保存した値が優先する。
 * 1段目の最上位の確率が店舗・娘の 1 段目のしきい値未満のとき、確認の「はい」がこの値以上であれば確定する。
 * 0.7 は D1 の測定（正しい店舗の「はい」の 91% が通り、誤った店舗の 9% が通る）から決めた仮の値で、後続の測定で決め直す。
 */
export const STORE_CONFIRM_THRESHOLD = 0.7
export const CHARACTER_CONFIRM_THRESHOLD = 0.7
const FieldThresholdSchema = z.number().positive().max(1)
/**
 * 項目別のしきい値すべて（12 項目）。状態（API のレスポンス）は常にこの形で、1項目でも欠ける・余分なキーがあると不正。
 * 保存・リクエストの形は、後から足した 4 項目を任意にした StoredFieldThresholdsSchema。
 */
export const FieldThresholdsSchema = z.strictObject({
  status: FieldThresholdSchema,
  category: FieldThresholdSchema,
  store: FieldThresholdSchema,
  store_confirm: FieldThresholdSchema,
  character: FieldThresholdSchema,
  character_confirm: FieldThresholdSchema,
  start_date: FieldThresholdSchema,
  end_date: FieldThresholdSchema,
  quantity: FieldThresholdSchema,
  condition: FieldThresholdSchema,
  purchase_amount: FieldThresholdSchema,
  charge_amount: FieldThresholdSchema
} satisfies Record<FieldThresholdKey, typeof FieldThresholdSchema>)
export type FieldThresholds = z.infer<typeof FieldThresholdsSchema>

/**
 * 保存済みの設定（KV）と保存リクエストの形。旧 8 項目は必須、後から足した store_confirm・character・character_confirm・charge_amount は任意。
 * 旧 8 項目だけの保存データも、8 キーだけを送る古いクライアントのリクエストも、そのまま読める（足りない項目は resolveFieldThresholds の既定値になる）。
 * 余分なキーは不正（strictObject）。
 */
export const StoredFieldThresholdsSchema = z.strictObject({
  status: FieldThresholdSchema,
  category: FieldThresholdSchema,
  store: FieldThresholdSchema,
  store_confirm: FieldThresholdSchema.optional(),
  character: FieldThresholdSchema.optional(),
  character_confirm: FieldThresholdSchema.optional(),
  start_date: FieldThresholdSchema,
  end_date: FieldThresholdSchema,
  quantity: FieldThresholdSchema,
  condition: FieldThresholdSchema,
  purchase_amount: FieldThresholdSchema,
  charge_amount: FieldThresholdSchema.optional()
} satisfies Record<FieldThresholdKey, z.ZodType>)

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
 * 項目ごとの有効なしきい値。上書き（管理画面で保存した値）があればそれ、無ければ既定値。
 * 既定値は status が min(fieldThreshold, STATUS_DEFAULT_THRESHOLD)、店舗・娘の 1 段目と確認の 4 項目が定数の 0.7（共通値 fieldThreshold には依らない）、
 * 他の 6 項目（category・start_date・end_date・quantity・condition・purchase_amount・charge_amount）は fieldThreshold（従来の共通値）。
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
    store: pick('store', STORE_DEFAULT_THRESHOLD),
    store_confirm: pick('store_confirm', STORE_CONFIRM_THRESHOLD),
    character: pick('character', CHARACTER_DEFAULT_THRESHOLD),
    character_confirm: pick('character_confirm', CHARACTER_CONFIRM_THRESHOLD),
    start_date: pick('start_date', fieldThreshold),
    end_date: pick('end_date', fieldThreshold),
    quantity: pick('quantity', fieldThreshold),
    condition: pick('condition', fieldThreshold),
    purchase_amount: pick('purchase_amount', fieldThreshold),
    charge_amount: pick('charge_amount', fieldThreshold)
  }
}
const isFieldThresholdKey = (key: string): key is FieldThresholdKey =>
  FIELD_THRESHOLD_KEYS.some((value) => value === key)

/**
 * 質問キーに対するしきい値。is_event は eventThreshold、項目別の 12 項目は有効値（保存値があればそれ、無ければ既定値）、
 * それ以外の未知のキーと旧版の venue.* / character.*（noul）は fieldThreshold。
 * 判定（evaluateDetection）・確認の対象選択（confirmTargetOf を呼ぶ側）・管理画面の回答表（describeAnswers）が同じ関数で引き、判定と表示がずれないようにする。
 */
export const thresholdOf = (thresholds: DetectionThresholds, key: string): number => {
  if (key === 'is_event') return thresholds.eventThreshold
  // v3〜v12 の保存データの店舗・ビッカメ娘ごとの質問（venue.* / character.*）。noul なので共通値で表示する。
  if (key.startsWith('venue.') || key.startsWith('character.')) return thresholds.fieldThreshold
  if (!isFieldThresholdKey(key)) return thresholds.fieldThreshold
  return resolveFieldThresholds(thresholds.fieldThreshold, thresholds.fieldThresholds)[key]
}
