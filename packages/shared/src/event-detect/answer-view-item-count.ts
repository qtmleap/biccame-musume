import type { AnswerRow } from './answer-view'
import type { ItemCountAudit } from './extraction'

// 配布物の種類数の判定（件数の監査）を、回答表の行と同じ形（質問・回答・確率・しきい値・判定）にする。
// 件数の監査は Clef の回答表（describeAnswers）とは別の経路で行われ、結果は webhook_event_jobs.extraction_json.itemCountAudit に保存される。
// ここは保存された ItemCountAudit だけから行を作る。判定は auditItemCount と同じ状態（status）をそのまま使い、別の規則を持たない。

/** 件数の判定行のキー。回答表の質問キー（answerQuestionKeys）には含めない（項目別のしきい値を持たず、判定時に保存した値で比べる）。 */
export const ITEM_COUNT_QUESTION_KEY = 'distribution_item_count'
const ITEM_COUNT_LABEL = '配布物の種類数'

/** 未確定の理由。文言は answer-view.ts の REASON_LABELS（distribution_item_count_*）と揃えた短い形。 */
const unconfirmedReason = (audit: ItemCountAudit): string | undefined => {
  switch (audit.status) {
    case 'matched':
      return undefined
    case 'mismatch':
      return `抽出${audit.extracted}種類と不一致`
    case 'unknown':
      return '種類数を確定できない'
    case 'low_confidence':
      return '確率がしきい値未満'
    case 'overflow':
      return '21種類以上（上限超過）'
  }
}

/**
 * 件数の監査を判定行にする。確定は status が matched のときだけ（itemCountReviewReasons が理由を返さない状態と同じ）。
 * しきい値は判定時に保存した値で、管理画面の現在の設定ではない。次点は ItemCountAudit に無いので持たない。
 */
export const describeItemCountAudit = (audit: ItemCountAudit): AnswerRow => {
  const reason = unconfirmedReason(audit)
  return {
    key: ITEM_COUNT_QUESTION_KEY,
    label: ITEM_COUNT_LABEL,
    answer: audit.expected === null ? '未確定' : `${audit.expected}種類`,
    probability: audit.probability,
    threshold: audit.threshold,
    confirmed: audit.status === 'matched',
    alternatives: [],
    ...(reason === undefined ? {} : { reason })
  }
}

/** 件数の監査を保存していないジョブ（旧保存値・未チェック）の行。確率・しきい値・判定は持たない。 */
export const uncheckedItemCountRow = (): AnswerRow => ({
  key: ITEM_COUNT_QUESTION_KEY,
  label: ITEM_COUNT_LABEL,
  answer: '未チェック',
  probability: null,
  threshold: null,
  confirmed: null,
  alternatives: [],
  reason: '旧保存値を含む。再判定時に投稿全体を確認します'
})
