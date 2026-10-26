import type { ClefModel } from '@biccame/shared/event-detect/clef'
import {
  FIELD_THRESHOLD_KEYS,
  type FieldThresholdKey,
  type FieldThresholds,
  FieldThresholdsSchema
} from '@biccame/shared/event-detect/detection'
import {
  type AdminBotConfigurationRequest,
  type EventThresholds,
  EventThresholdsSchema
} from '@biccame/shared/schemas/admin-bot.dto'

// しきい値の編集欄まわりの純関数。画面は%で入力・表示し、保存は 0〜1 の値で送る。
// 編集できるのは、項目別の12項目（回答表の質問と同じ順）と、判定全体の3つ（登録・必須項目の選択・対象外）。
// 画面（bot-management.tsx）から切り出してあり、入力検証・変更検知・保存可否をレンダリングなしで確認できる。

/** 判定全体の3つのしきい値のキー。 */
export const EVENT_THRESHOLD_KEYS = ['eventThreshold', 'ignoreThreshold', 'choiceThreshold'] as const
export type EventThresholdKey = (typeof EVENT_THRESHOLD_KEYS)[number]
/**
 * 画面で編集できる項目別のキー。保存・API の形（FIELD_THRESHOLD_KEYS）と同じ12項目で、回答表の質問と同じ順
 * （状態・配布物・開催・配布店舗・その確認・対象ビッカメ娘・その確認・開始日・終了日・配布数・配布条件・購入額・入金・チャージ額）。
 */
export type EditableFieldThresholdKey = FieldThresholdKey
export const EDITABLE_FIELD_THRESHOLD_KEYS: readonly EditableFieldThresholdKey[] = FIELD_THRESHOLD_KEYS
/** 編集欄ごとのキー。項目別の12項目と判定全体の3つ。 */
export type ThresholdKey = EditableFieldThresholdKey | EventThresholdKey

/** 入力欄の文字列。編集された項目だけを持つ（無い項目は保存済みの値をそのまま出す）。 */
export type FieldThresholdDrafts = Partial<Record<ThresholdKey, string>>
export type FieldThresholdErrors = Partial<Record<ThresholdKey, string>>

/** 入力できる範囲（%）。下限は 0.1（保存値 0.001）、小数は1桁まで。対象外の閾値だけは 0 も入力できる。 */
const PERCENT_MIN = 0.1
const PERCENT_MAX = 100
const PERCENT_PATTERN = /^\d+(?:\.\d)?$/

export const THRESHOLD_EMPTY_ERROR = '値を入力してください。'
export const THRESHOLD_RANGE_ERROR = '0.1〜100の数値（小数1桁まで）で入力してください。'
/** 対象外の閾値は 0 を許す（環境変数の仕様と同じ）。 */
export const IGNORE_THRESHOLD_RANGE_ERROR = '0〜100の数値（小数1桁まで）で入力してください。'
export const IGNORE_THRESHOLD_ORDER_ERROR = '対象外判定の閾値は登録の閾値より小さくしてください。'

/**
 * %の入力文字列を 0〜1 のしきい値にする。範囲外・数値以外・小数2桁以上は null。
 * 82.5 → 0.825 のように、浮動小数点ノイズが出ないよう整数（0.1% 単位）に直してから 1000 で割る。
 * 下限は既定で 0.1%。対象外の閾値だけ allowZero で 0% を通す。
 */
export const percentToThreshold = (text: string, allowZero = false): number | null => {
  const trimmed = text.trim()
  if (!PERCENT_PATTERN.test(trimmed)) return null
  const percent = Number(trimmed)
  if (percent < (allowZero ? 0 : PERCENT_MIN) || percent > PERCENT_MAX) return null
  return Math.round(percent * 10) / 1000
}

/** 保存済みのしきい値（0〜1）を入力欄の%表記にする。0.9 → '90'、0.825 → '82.5'。 */
export const thresholdToPercentText = (value: number): string => String(Math.round(value * 1000) / 10)

/** 入力欄1つの検証結果。問題が無ければ null。allowZero は対象外の閾値用（0% も可）。 */
export const thresholdInputError = (text: string, allowZero = false): string | null => {
  if (text.trim() === '') return THRESHOLD_EMPTY_ERROR
  if (percentToThreshold(text, allowZero) !== null) return null
  return allowZero ? IGNORE_THRESHOLD_RANGE_ERROR : THRESHOLD_RANGE_ERROR
}

/** 入力欄に出す文字列。編集中ならその文字列、そうでなければ保存済みの値の%表記。 */
const inputValueOf = (saved: number, draft: string | undefined): string =>
  draft === undefined ? thresholdToPercentText(saved) : draft

/** 項目別の入力欄に出す文字列。 */
export const fieldThresholdInputValue = (
  saved: FieldThresholds,
  drafts: FieldThresholdDrafts,
  key: EditableFieldThresholdKey
): string => inputValueOf(saved[key], drafts[key])

/** 判定全体の3つの入力欄に出す文字列。 */
export const eventThresholdInputValue = (
  saved: EventThresholds,
  drafts: FieldThresholdDrafts,
  key: EventThresholdKey
): string => inputValueOf(saved[key], drafts[key])

export type BotConfigurationForm = {
  /** 検証エラーのある項目ごとのメッセージ */
  errors: FieldThresholdErrors
  /** 保存するときに送る body。入力に不正がある・データ未取得なら null */
  request: AdminBotConfigurationRequest | null
  /** 保存ボタンを有効にしてよいか。モデルかしきい値のどれかが変わり、入力が全て正しく、処理中でない時だけ true */
  canSave: boolean
}

const ALL_THRESHOLD_KEYS: readonly ThresholdKey[] = [...EDITABLE_FIELD_THRESHOLD_KEYS, ...EVENT_THRESHOLD_KEYS]

/**
 * 判定モデルの選択としきい値（判定全体の3つと項目別の12項目）の編集内容から、エラー・保存 body・保存可否を決める。
 * 編集していない値は保存済みの値を一切変換せず送る（環境変数由来の小数も丸めない）。
 */
export const botConfigurationForm = (input: {
  savedModel: ClefModel | undefined
  selectedModel: ClefModel | null
  savedEventThresholds: EventThresholds | undefined
  savedThresholds: FieldThresholds | undefined
  drafts: FieldThresholdDrafts
  busy: boolean
}): BotConfigurationForm => {
  const { savedModel, selectedModel, savedEventThresholds, savedThresholds, drafts, busy } = input
  if (savedModel === undefined || savedEventThresholds === undefined || savedThresholds === undefined) {
    return { errors: {}, request: null, canSave: false }
  }
  const errors = Object.fromEntries(
    ALL_THRESHOLD_KEYS.flatMap((key) => {
      const text = drafts[key]
      const error = text === undefined ? null : thresholdInputError(text, key === 'ignoreThreshold')
      return error === null ? [] : [[key, error]]
    })
  )
  // 判定全体の3つ。編集していない値は保存済みの値、編集中なら入力を 0〜1 にしたもの（不正なら null）。
  const eventCandidate = Object.fromEntries(
    EVENT_THRESHOLD_KEYS.map((key) => {
      const text = drafts[key]
      return [key, text === undefined ? savedEventThresholds[key] : percentToThreshold(text, key === 'ignoreThreshold')]
    })
  )
  // 対象外は登録より小さい必要がある。どちらかの入力が不正なときは、その欄のエラーだけを出す。
  const ignoreValue = eventCandidate.ignoreThreshold
  const eventValue = eventCandidate.eventThreshold
  const ignoreOrderError =
    errors.ignoreThreshold === undefined &&
    typeof ignoreValue === 'number' &&
    typeof eventValue === 'number' &&
    ignoreValue >= eventValue
  const allErrors = ignoreOrderError ? { ...errors, ignoreThreshold: IGNORE_THRESHOLD_ORDER_ERROR } : errors
  const fieldCandidate = Object.fromEntries(
    EDITABLE_FIELD_THRESHOLD_KEYS.map((key) => {
      const text = drafts[key]
      return [key, text === undefined ? savedThresholds[key] : percentToThreshold(text)]
    })
  )
  const eventParsed = EventThresholdsSchema.safeParse(eventCandidate)
  const fieldParsed = FieldThresholdsSchema.safeParse(fieldCandidate)
  if (!eventParsed.success || !fieldParsed.success) return { errors: allErrors, request: null, canSave: false }
  const model = selectedModel === null ? savedModel : selectedModel
  const changed =
    model !== savedModel ||
    EDITABLE_FIELD_THRESHOLD_KEYS.some((key) => fieldParsed.data[key] !== savedThresholds[key]) ||
    EVENT_THRESHOLD_KEYS.some((key) => eventParsed.data[key] !== savedEventThresholds[key])
  return {
    errors: allErrors,
    request: { model, thresholds: eventParsed.data, fieldThresholds: fieldParsed.data },
    canSave: changed && !busy
  }
}
