import { describeMergedCharacter, roundProbability } from './answer-view-character'
import { storeShortName } from './association-questions'
import {
  ASSOCIATION_MULTIPLE,
  ASSOCIATION_NONE,
  CHARACTER_CONFIRM_KEY,
  CHARACTER_OTHER,
  CHARACTER_QUESTION_KEY,
  CHARACTER_SECRET,
  CHARACTER_STORE,
  detectionCharacters,
  detectionStores,
  STORE_CONFIRM_KEY,
  STORE_QUESTION_KEY
} from './associations'
import type { ClefAnswer } from './clef'
import { keyToDate, keyToQuantity } from './decide'
import { type DetectionThresholds, thresholdOf } from './detection'
import { hasExistingEventReason, withoutNewEventOnlyReasons } from './detection-reasons'

// 管理画面向けの表示名をここから参照できるようにする（vite が起動時の exports を保持していても解決できる入口）。
export { promptVersionLabel } from './prompt-version-label'

// 保存済みの Clef 回答を、管理画面で読める形に変換する。
// 質問の再生成（createDetectionRequest）には依存しない。質問の版が変わると保存済みの回答と食い違うため、
// 回答に入っているキーだけを見て、知らない質問・選択肢はキーのまま出す。

export type AnswerAlternative = { answer: string; probability: number }
export type AnswerRow = {
  key: string
  label: string
  answer: string
  /** 表示した回答の確率（noul は、はいなら肯定の確率、いいえなら1から引いた確率）。確率を持たない回答（score など）は null */
  probability: number | null
  /**
   * しきい値（0〜1）。thresholdOf が返す、判定で実際に効く値。
   * 判定を直下の確認が担う行（回答に対応する確認の行がある store / character の choice 行）では、確認を省いて確定できる 1 段目の下限を表す
   * （最上位の確率がこの値未満のときだけ確認を聞く）。管理画面で保存した値があればそれ、無ければ 70%。
   */
  threshold: number | null
  /**
   * 確定か。判定を直下の確認の行が担う行（上記の choice 行）は null で、画面は「—」を出す。
   * 判定は直下の確認の行が決める（1段目の確率が70%未満なら確認の「はい」で決まる）ので、choice 行に確定・未確定を出すと食い違って見える。
   */
  confirmed: boolean | null
  /** 次点まで最大2件（確率の降順、選ばれた回答は除く）。noul は反対の回答1件 */
  alternatives: AnswerAlternative[]
}

/** 行の並びと質問の日本語名。ここに無いキーは最後にキー名のまま出す。 */
const QUESTION_LABELS: ReadonlyMap<string, string> = new Map([
  ['is_event', 'ビッカメ娘のイベントか'],
  ['status', '状態'],
  ['category', '配布物'],
  ['single_event', '単一イベントか'],
  // 店舗と対象ビッカメ娘は v13 では choice 1 問ずつ。画面の補い行（webhook-answer-table.tsx）と同じ文言にする。
  ['store', '開催・配布店舗'],
  // v16 以降の2段目。1段目で最上位に選んだ店舗・娘に対する、はい/いいえの確認。行のラベルは対象の名前を添えず、このまま出す。
  [STORE_CONFIRM_KEY, '開催・配布店舗の確認'],
  ['character', '対象ビッカメ娘'],
  [CHARACTER_CONFIRM_KEY, '対象ビッカメ娘の確認'],
  ['start_date', '開始日'],
  ['end_date', '終了日'],
  ['quantity', '配布数'],
  ['condition', '配布条件'],
  ['purchase_amount', '購入額'],
  ['charge_amount', '入金・チャージ額']
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
  ['gift_card', 'ギフトカード'],
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
  ['charge', '入金・チャージ'],
  ['charge_first_come', '入金・チャージ＋先着'],
  ['charge_lottery', '入金・チャージ＋抽選'],
  ['purchase_charge', '購入＋入金・チャージ'],
  ['purchase_charge_first_come', '購入＋入金・チャージ＋先着'],
  ['purchase_charge_lottery', '購入＋入金・チャージ＋抽選'],
  ['none', '確定できない']
])
const SPECIAL_CHARACTER_LABELS: ReadonlyMap<string, string> = new Map([
  // v17 以降。質問の選択肢の説明（association-questions.ts の CHARACTER_STORE_CRITERIA）は長いので、回答表には短い固定ラベルで出す。
  [CHARACTER_STORE, '店舗の娘'],
  [CHARACTER_OTHER, 'その他'],
  [CHARACTER_SECRET, 'シークレット'],
  [ASSOCIATION_MULTIPLE, '複数'],
  [ASSOCIATION_NONE, '該当なし']
])
const yenFormat = new Intl.NumberFormat('en-US')

const YES_LABEL = 'はい'
const NO_LABEL = 'いいえ'

const lookup = (labels: ReadonlyMap<string, string>, value: string): string => {
  const label = labels.get(value)
  return label === undefined ? value : label
}

/** 回答表の質問キー（行の並びの順）。管理画面の項目別しきい値との対応が崩れていないかを、テストで検査するために公開する。 */
export const answerQuestionKeys = (): readonly string[] => [...QUESTION_LABELS.keys()]

/** 質問キーの日本語名（回答表の「質問」列と同じ）。知らないキーはキーのまま返す。 */
export const questionLabel = (key: string): string => {
  if (key.startsWith('venue.')) {
    const id = key.slice('venue.'.length)
    const store = detectionStores.find((entry) => entry.id === id)
    return `開催店舗: ${store === undefined ? id : store.name}`
  }
  if (key.startsWith('character.')) {
    const id = key.slice('character.'.length)
    const character = detectionCharacters.find((entry) => entry.id === id)
    return `対象ビッカメ娘: ${character === undefined ? id : character.name}`
  }
  return lookup(QUESTION_LABELS, key)
}

// 店舗名は「ビックカメラ」を付けないアプリの短い名前で出す（質問の選択肢の説明と同じ storeShortName）。
const storeChoiceLabel = (value: string): string => {
  if (value === ASSOCIATION_NONE) return '店舗なし'
  if (value === ASSOCIATION_MULTIPLE) return '複数'
  return storeShortName(value)
}
const characterChoiceLabel = (value: string): string => {
  const special = SPECIAL_CHARACTER_LABELS.get(value)
  if (special !== undefined) return special
  const character = detectionCharacters.find((entry) => entry.id === value)
  return character === undefined ? value : character.name
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
      return storeChoiceLabel(value)
    case 'character':
      return characterChoiceLabel(value)
    case 'start_date':
    case 'end_date':
      return dateLabel(value)
    case 'quantity':
      return quantityLabel(value)
    case 'condition':
      return lookup(CONDITION_LABELS, value)
    case 'purchase_amount':
    case 'charge_amount':
      return amountLabel(value)
    default:
      return value
  }
}

// 1段目の choice の行と、その判定を担う確認の行の対応。確認の行が回答にある choice 行は、判定（confirmed）を null にする。しきい値は残す。
const CONFIRM_KEY_OF: ReadonlyMap<string, string> = new Map([
  [STORE_QUESTION_KEY, STORE_CONFIRM_KEY],
  [CHARACTER_QUESTION_KEY, CHARACTER_CONFIRM_KEY]
])

const describeAnswer = (
  key: string,
  answer: ClefAnswer,
  thresholds: DetectionThresholds,
  answers: Record<string, ClefAnswer>
): AnswerRow => {
  const label = questionLabel(key)
  // しきい値は evaluateDetection と同じ thresholdOf で引く（is_event はイベント用、店舗・娘は固定の 70%、未知のキーは共通値）。
  // 回答表の確定表示と実際の判定がずれないよう、ここで別の規則を持たない。
  const threshold = thresholdOf(thresholds, key)
  // 対応する確認の行（store_confirm / character_confirm）が回答にある choice 行は、判定をその確認の行が担う（「確認が確定なら choice が確定かどうかは
  // どうでもいい」）ので confirmed は null。しきい値は、確認を聞くかどうかを決める下限として thresholdOf の値をそのまま残す（確認があっても効いている値）。
  // 保存済みの回答だけから決めるので、request は再生成しない。確認の行が無い保存データ（v15 以前）は、しきい値と確定を従来どおり出す。
  const confirmKey = CONFIRM_KEY_OF.get(key)
  const decidedByConfirm = confirmKey !== undefined && answers[confirmKey] !== undefined
  if (answer.type === 'noul') {
    // noul は肯定の確率 P(はい)。0.5 以上なら「はい」、未満なら「いいえ」を回答として出し、反対の回答を次点に出す。
    const yes = answer.noul
    const no = roundProbability(1 - yes)
    const isYes = yes >= 0.5
    return {
      key,
      label,
      answer: isYes ? YES_LABEL : NO_LABEL,
      probability: isYes ? yes : no,
      threshold,
      // 確定は表示した回答ではなく P(はい) をしきい値と比べる（evaluateDetection と同じ）。
      confirmed:
        key.startsWith('venue.') || key.startsWith('character.') ? Math.max(yes, no) >= threshold : yes >= threshold,
      alternatives: [{ answer: isYes ? NO_LABEL : YES_LABEL, probability: isYes ? no : yes }]
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
  // 対象ビッカメ娘は、店舗が具体的な S のとき、店舗の娘（store_character）と S の娘自身を 1 つにまとめて出す（同じ人物を指すので確率を割らない）。
  // まとめない条件に当てはまれば undefined で、下の通常の行になる。判定（resolveCharacterIds）は変えない。
  if (key === CHARACTER_QUESTION_KEY) {
    const merged = describeMergedCharacter(answers, { label, threshold, decidedByConfirm }, (value) =>
      choiceLabel(key, value)
    )
    if (merged !== undefined) return merged
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
    // 終了日の最有力が none（記載なし）なら、確率がしきい値未満でも確定扱い。evaluateDetection の終了日の扱いと揃える。
    confirmed: decidedByConfirm
      ? null
      : (key === 'end_date' && answer.choice === 'none') || (probability !== null && probability >= threshold),
    alternatives
  }
}

/**
 * 質問ごとの回答・確率・しきい値との比較を、固定の順（既知の質問、その後に未知のキー）で返す。
 * 確定の判定は evaluateDetection と同じく「確率がしきい値以上」。ただし終了日の最有力が none なら、しきい値未満でも確定。
 */
export const describeAnswers = (answers: Record<string, ClefAnswer>, thresholds: DetectionThresholds): AnswerRow[] => {
  const known = [...QUESTION_LABELS.keys()].filter((key) => Object.hasOwn(answers, key))
  const unknown = Object.keys(answers).filter((key) => !QUESTION_LABELS.has(key))
  return [...known, ...unknown].flatMap((key) => {
    const answer = answers[key]
    return answer === undefined ? [] : [describeAnswer(key, answer, thresholds, answers)]
  })
}

// 画面には出さない情報用のコード。判定の理由ではなく、登録候補を作るときに何をしたかの記録（登録可否には影響しない）。
// 保存はするが理由の表示からは除く。除外の基準はこの表のキーだけにして、REASON_LABELS へ取り込む。ラベルとの食い違いを防ぐ。
const NOTE_REASON_LABELS: ReadonlyMap<string, string> = new Map([
  // 店舗を投稿アカウントから補って登録候補にしたこと。
  ['store_inferred_from_account', '店舗は投稿アカウントから補完'],
  // 自動登録するイベントのタイトルを AI が作れたか、作れず定型のまま登録したか（webhook-candidate-process.ts）。
  ['title_generated', 'タイトルは AI が作成'],
  ['title_fallback', 'タイトルは定型（AI の作成に失敗）']
])

// 自動登録できなかったことを示すだけの総括のコード。具体的な理由（condition_pattern_unconfirmed など）は別のコードで併記されるので、そちらがあるときは表示から除く。
const GENERIC_REASON = 'auto_registration_not_allowed'

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
  ['status_unconfirmed', '告知・継続・終了の状態を確定できない'],
  ['existing_event_update', '既存企画の継続・更新情報'],
  ['event_ended', '既存企画の終了情報'],
  ['distribution_item_unspecified', '対象物が未記載・未発表'],
  ['start_date_unspecified', '初回開始日が未記載'],
  ['distribution_condition_unspecified', '入手条件が未記載・未発表'],
  ['multiple_or_ambiguous_events', '複数または曖昧なイベント'],
  // 件数の監査は自動登録の関門ではなくなった。以下の4つは、関門があった頃に保留になった旧ジョブの reasons_json を読めるよう残す。
  ['distribution_item_count_mismatch', '配布物の種類数と抽出結果が一致しない'],
  ['distribution_item_count_unknown', '配布物の種類数を確定できない'],
  ['distribution_item_count_low_confidence', '配布物の種類数の確率がしきい値未満'],
  ['distribution_item_count_overflow', '配布物が21種類以上で抽出上限を超えている'],
  ['multiple_or_ambiguous_stores', '複数または曖昧な店舗'],
  ['category_unconfirmed', '配布物を確定できない'],
  ['store_unconfirmed', '開催店舗を確定できない'],
  ['store_mismatch', '抽出した開催店舗と判定した店舗が一致しない'],
  ['character_unconfirmed', '対象ビッカメ娘を確定できない'],
  // 2段目の確認（detection.ts の evaluateDetection）。確定できない理由（store_unconfirmed・character_unconfirmed）に併記する。
  ['store_confirm_low', '開催店舗の確認の確率がしきい値未満'],
  ['character_confirm_low', '対象ビッカメ娘の確認の確率がしきい値未満'],
  ['start_date_unconfirmed', '開始日を確定できない'],
  ['end_date_unconfirmed', '終了日を確定できない'],
  ['invalid_date_range', '期間が不正'],
  ['distribution_condition_unconfirmed', '配布条件を確定できない'],
  ['purchase_amount_unconfirmed', '購入額を確定できない'],
  ['charge_amount_unconfirmed', '入金・チャージ額を確定できない'],
  ['quantity_unconfirmed', '配布数を確定できない'],
  ['unmodeled_distribution_condition', '未対応の配布条件'],
  // 自動登録の精度のための保留規則（detection.ts の gateReasons）。Golden で誤登録が多かった形を人が確認する。
  ['condition_pattern_unconfirmed', '配布条件の組み合わせが自動登録の対象外'],
  ['charge_condition_unconfirmed', '入金・チャージ条件は自動登録の対象外'],
  ['extraction_store_unspecified', '抽出段階で開催店舗を特定できていない'],
  ['invalid_event_candidate', '登録候補が不正'],
  // 判定は登録でも自動登録の条件を満たさず保留にしたこと（webhook-candidate-process.ts）。具体的な理由が併記されないことがある。
  [GENERIC_REASON, '自動登録の条件を満たさない'],
  // 画面には出さない情報用のコード（NOTE_REASON_LABELS）
  ...NOTE_REASON_LABELS,
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

/**
 * 保存された理由コードから、画面に出さない情報用のコード（NOTE_REASON_LABELS）を除く。表示のための絞り込みで、保存する値や登録可否は変えない。
 * 継続・終了と判定された投稿（existing_event_update / event_ended がある）は、新規登録向けの理由（開始日・配布条件・金額など。detection-reasons.ts）も除く。
 * 現行の判定はそもそも付けないが、すでに保存された旧ジョブには付いているため。状態の理由は残るので、理由が空にはならない。
 * 総括の auto_registration_not_allowed は、ほかに理由が残るときは除く。それだけのときは、保留の理由が無いように見えないよう残す。
 * 未知のコードや `<code>:<id>` の形は残す。元の並びは保つ。
 * 引数は 1 件の判定の理由を想定する。複数候補の理由を合わせた配列を渡すと、告知の候補の理由まで除くことがある（管理画面は候補ごとに渡している）。
 */
export const judgmentReasons = (reasons: readonly string[]): string[] => {
  const visible = reasons.filter((reason) => !NOTE_REASON_LABELS.has(reason))
  const shown = hasExistingEventReason(visible) ? withoutNewEventOnlyReasons(visible) : visible
  const specific = shown.filter((reason) => reason !== GENERIC_REASON)
  return specific.length > 0 ? specific : shown
}
