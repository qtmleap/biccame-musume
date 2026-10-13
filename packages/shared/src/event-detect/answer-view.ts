import { botStores } from '../stores'
import type { ClefAnswer } from './clef'
import { keyToDate, keyToQuantity } from './decide'
import type { DetectionThresholds } from './detection'

// 保存済みの Clef 回答を、管理画面で読める形に変換する。
// 質問の再生成（createDetectionRequest）には依存しない。質問の版が変わると保存済みの回答と食い違うため、
// 回答に入っているキーだけを見て、知らない質問・選択肢はキーのまま出す。

export type AnswerAlternative = { answer: string; probability: number }
export type AnswerRow = {
  key: string
  label: string
  answer: string
  /** 選ばれた回答の確率。noul は肯定の確率。確率を持たない回答（score など）は null */
  probability: number | null
  threshold: number
  confirmed: boolean
  /** 次点まで最大2件（確率の降順、選ばれた回答は除く） */
  alternatives: AnswerAlternative[]
}

/** 行の並びと質問の日本語名。ここに無いキーは最後にキー名のまま出す。 */
const QUESTION_LABELS: ReadonlyMap<string, string> = new Map([
  ['is_event', 'ビッカメ娘のイベントか'],
  ['status', '状態'],
  ['category', '配布物'],
  ['single_event', '単一イベントか'],
  ['store', '店舗'],
  ['start_date', '開始日'],
  ['end_date', '終了日'],
  ['quantity', '配布数'],
  ['condition', '配布条件'],
  ['purchase_amount', '購入額']
])

const STATUS_LABELS: ReadonlyMap<string, string> = new Map([
  ['announce', '告知'],
  ['start', '開始'],
  ['ongoing', '継続'],
  ['end', '終了'],
  ['none', '状態なし']
])
const CATEGORY_LABELS: ReadonlyMap<string, string> = new Map([
  ['limited_card', '限定名刺'],
  ['regular_card', '通常名刺'],
  ['ackey', 'アクキー'],
  ['acsta', 'アクスタ'],
  ['other', 'その他'],
  ['none', '配布物の話ではない']
])
const CONDITION_LABELS: ReadonlyMap<string, string> = new Map([
  ['purchase', '購入者に配布'],
  ['first_come', '先着'],
  ['lottery', '抽選'],
  ['everyone', '全員'],
  ['purchase_first_come', '購入＋先着'],
  ['purchase_lottery', '購入＋抽選'],
  ['none', '確定できない']
])
const storeNames: ReadonlyMap<string, string> = new Map(botStores.map((store) => [store.id, store.name]))
const yenFormat = new Intl.NumberFormat('en-US')

const lookup = (labels: ReadonlyMap<string, string>, value: string): string => {
  const label = labels.get(value)
  return label === undefined ? value : label
}

const dateLabel = (value: string): string => {
  if (value === 'none') return 'なし'
  const date = keyToDate(value)
  return date === undefined ? value : date
}
const quantityLabel = (value: string): string => {
  if (value === 'none') return 'なし'
  const quantity = keyToQuantity(value)
  return quantity === undefined ? value : String(quantity)
}
const amountLabel = (value: string): string => {
  if (value === 'none') return 'なし'
  const match = /^p(\d+)$/.exec(value)
  return match === null ? value : `${yenFormat.format(Number(match[1]))}円`
}

/** 選択肢のキーを日本語にする。該当しないキーは版が変わっても例外にせず、キーのまま返す。 */
const choiceLabel = (key: string, value: string): string => {
  switch (key) {
    case 'status':
      return lookup(STATUS_LABELS, value)
    case 'category':
      return lookup(CATEGORY_LABELS, value)
    case 'store':
      return value === 'none' ? '店舗なし' : lookup(storeNames, value)
    case 'start_date':
    case 'end_date':
      return dateLabel(value)
    case 'quantity':
      return quantityLabel(value)
    case 'condition':
      return lookup(CONDITION_LABELS, value)
    case 'purchase_amount':
      return amountLabel(value)
    default:
      return value
  }
}

const describeAnswer = (key: string, answer: ClefAnswer, thresholds: DetectionThresholds): AnswerRow => {
  const label = lookup(QUESTION_LABELS, key)
  // ビッカメ娘のイベントか（is_event）だけがイベント用のしきい値、それ以外（単一イベントか・全ての選択肢）は項目用のしきい値。
  const threshold = key === 'is_event' ? thresholds.eventThreshold : thresholds.fieldThreshold
  if (answer.type === 'noul') {
    return {
      key,
      label,
      answer: 'はい',
      probability: answer.noul,
      threshold,
      confirmed: answer.noul >= threshold,
      alternatives: []
    }
  }
  if (answer.type === 'score') {
    return {
      key,
      label,
      answer: String(answer.score),
      probability: null,
      threshold,
      confirmed: false,
      alternatives: []
    }
  }
  const selected = answer.probabilities[answer.choice]
  const probability = selected === undefined ? null : selected
  const alternatives = Object.entries(answer.probabilities)
    .filter(([choice]) => choice !== answer.choice)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([choice, value]) => ({ answer: choiceLabel(key, choice), probability: value }))
  return {
    key,
    label,
    answer: choiceLabel(key, answer.choice),
    probability,
    threshold,
    confirmed: probability !== null && probability >= threshold,
    alternatives
  }
}

/**
 * 質問ごとの回答・確率・しきい値との比較を、固定の順（既知の質問、その後に未知のキー）で返す。
 * 確定の判定は evaluateDetection と同じく「確率がしきい値以上」。
 */
export const describeAnswers = (answers: Record<string, ClefAnswer>, thresholds: DetectionThresholds): AnswerRow[] => {
  const known = [...QUESTION_LABELS.keys()].filter((key) => Object.hasOwn(answers, key))
  const unknown = Object.keys(answers).filter((key) => !QUESTION_LABELS.has(key))
  return [...known, ...unknown].flatMap((key) => {
    const answer = answers[key]
    return answer === undefined ? [] : [describeAnswer(key, answer, thresholds)]
  })
}

// 判定理由コード。detection.ts（evaluateDetection）・filter.ts（DROP_REASONS）・webhook-process.ts・webhook-admin.ts で出す全てを網羅する。
const REASON_LABELS: ReadonlyMap<string, string> = new Map([
  // 除外（filter.ts の DROP_REASONS）
  ['retweet', 'RT'],
  ['reply_to_other', '他者宛てリプライ'],
  ['non_store_account', '店舗以外のアカウント'],
  ['no_keyword', 'キーワードなし'],
  ['excluded_keyword', '除外語'],
  // 判定（detection.ts の evaluateDetection）
  ['not_distribution_event', 'ビッカメ娘のイベントではない'],
  ['event_confidence_below_threshold', 'ビッカメ娘のイベントと確信できない'],
  ['not_new_event_announcement', '新規の告知ではない'],
  ['multiple_or_ambiguous_events', '複数または曖昧なイベント'],
  ['multiple_or_ambiguous_stores', '複数または曖昧な店舗'],
  ['category_unconfirmed', '配布物を確定できない'],
  ['store_unconfirmed', '店舗を確定できない'],
  ['start_date_unconfirmed', '開始日を確定できない'],
  ['end_date_unconfirmed', '終了日を確定できない'],
  ['invalid_date_range', '期間が不正'],
  ['distribution_condition_unconfirmed', '配布条件を確定できない'],
  ['purchase_amount_unconfirmed', '購入額を確定できない'],
  ['quantity_unconfirmed', '配布数を確定できない'],
  ['unmodeled_distribution_condition', '未対応の配布条件'],
  ['invalid_event_candidate', '登録候補が不正'],
  // 情報用。店舗を投稿アカウントから補って登録候補にしたことを示す（登録可否には影響しない）。
  ['store_inferred_from_account', '店舗は投稿アカウントから補完'],
  // 管理画面での手動解決（webhook-admin.ts）
  ['manually_linked', '手動で紐付け'],
  ['manually_rejected', '手動で却下']
])
/** `<code>:<id>` の形で出る理由。コロンより前のコードで引く。 */
const DUPLICATE_LABEL = '重複の可能性あり'
const PREFIXED_REASON_LABELS: ReadonlyMap<string, string> = new Map([
  ['possible_duplicate', DUPLICATE_LABEL],
  ['possible_duplicate_post', DUPLICATE_LABEL]
])

/** 判定理由コードを日本語にする。未知のコードはそのまま返す。 */
export const reasonLabel = (code: string): string => {
  const exact = REASON_LABELS.get(code)
  if (exact !== undefined) return exact
  const separator = code.indexOf(':')
  if (separator < 0) return code
  const prefixed = PREFIXED_REASON_LABELS.get(code.slice(0, separator))
  return prefixed === undefined ? code : prefixed
}
