import type { ClefModel } from '@biccame/shared/event-detect/clef'
import {
  FIELD_THRESHOLD_KEYS,
  type FieldThresholdKey,
  type FieldThresholds,
  FieldThresholdsSchema
} from '@biccame/shared/event-detect/detection'
import type { AdminBotConfigurationRequest } from '@biccame/shared/schemas/admin-bot.dto'

// 項目別しきい値の編集欄まわりの純関数。画面は%で入力・表示し、保存は 0〜1 の値で送る。
// 画面（bot-management.tsx）から切り出してあり、入力検証・変更検知・保存可否をレンダリングなしで確認できる。

/** 入力欄の文字列。編集された項目だけを持つ（無い項目は保存済みの値をそのまま出す）。 */
export type FieldThresholdDrafts = Partial<Record<FieldThresholdKey, string>>
export type FieldThresholdErrors = Partial<Record<FieldThresholdKey, string>>

/** 入力できる範囲（%）。下限は 0.1（保存値 0.001）、小数は1桁まで。 */
const PERCENT_MIN = 0.1
const PERCENT_MAX = 100
const PERCENT_PATTERN = /^\d+(?:\.\d)?$/

export const THRESHOLD_EMPTY_ERROR = '値を入力してください。'
export const THRESHOLD_RANGE_ERROR = '0.1〜100の数値（小数1桁まで）で入力してください。'

/**
 * %の入力文字列を 0〜1 のしきい値にする。範囲外・数値以外・小数2桁以上は null。
 * 82.5 → 0.825 のように、浮動小数点ノイズが出ないよう整数（0.1% 単位）に直してから 1000 で割る。
 */
export const percentToThreshold = (text: string): number | null => {
  const trimmed = text.trim()
  if (!PERCENT_PATTERN.test(trimmed)) return null
  const percent = Number(trimmed)
  if (percent < PERCENT_MIN || percent > PERCENT_MAX) return null
  return Math.round(percent * 10) / 1000
}

/** 保存済みのしきい値（0〜1）を入力欄の%表記にする。0.9 → '90'、0.825 → '82.5'。 */
export const thresholdToPercentText = (value: number): string => String(Math.round(value * 1000) / 10)

/** 入力欄1つの検証結果。問題が無ければ null。 */
export const thresholdInputError = (text: string): string | null => {
  if (text.trim() === '') return THRESHOLD_EMPTY_ERROR
  return percentToThreshold(text) === null ? THRESHOLD_RANGE_ERROR : null
}

/** 入力欄に出す文字列。編集中ならその文字列、そうでなければ保存済みの値の%表記。 */
export const fieldThresholdInputValue = (
  saved: FieldThresholds,
  drafts: FieldThresholdDrafts,
  key: FieldThresholdKey
): string => {
  const draft = drafts[key]
  return draft === undefined ? thresholdToPercentText(saved[key]) : draft
}

export type BotConfigurationForm = {
  /** 検証エラーのある項目ごとのメッセージ */
  errors: FieldThresholdErrors
  /** 保存するときに送る body。入力に不正がある・データ未取得なら null */
  request: AdminBotConfigurationRequest | null
  /** 保存ボタンを有効にしてよいか。モデルかしきい値のどれかが変わり、入力が全て正しく、処理中でない時だけ true */
  canSave: boolean
}

/**
 * 判定モデルの選択と項目別しきい値の編集内容から、エラー・保存 body・保存可否を決める。
 * 編集していない項目は保存済みの値を一切変換せず送る（環境変数由来の小数も丸めない）。
 */
export const botConfigurationForm = (input: {
  savedModel: ClefModel | undefined
  selectedModel: ClefModel | null
  savedThresholds: FieldThresholds | undefined
  drafts: FieldThresholdDrafts
  busy: boolean
}): BotConfigurationForm => {
  const { savedModel, selectedModel, savedThresholds, drafts, busy } = input
  if (savedModel === undefined || savedThresholds === undefined) return { errors: {}, request: null, canSave: false }
  const errors = Object.fromEntries(
    FIELD_THRESHOLD_KEYS.flatMap((key) => {
      const text = drafts[key]
      const error = text === undefined ? null : thresholdInputError(text)
      return error === null ? [] : [[key, error]]
    })
  )
  const candidate = Object.fromEntries(
    FIELD_THRESHOLD_KEYS.map((key) => {
      const text = drafts[key]
      return [key, text === undefined ? savedThresholds[key] : percentToThreshold(text)]
    })
  )
  const parsed = FieldThresholdsSchema.safeParse(candidate)
  if (!parsed.success) return { errors, request: null, canSave: false }
  const model = selectedModel === null ? savedModel : selectedModel
  const changed = model !== savedModel || FIELD_THRESHOLD_KEYS.some((key) => parsed.data[key] !== savedThresholds[key])
  return { errors, request: { model, fieldThresholds: parsed.data }, canSave: changed && !busy }
}
