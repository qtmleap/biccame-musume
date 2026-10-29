// 判定理由のうち、新規の告知・開始の登録にだけ意味を持つもの（日付・配布条件・金額と、本文の条件の語）。
// 状態が継続・終了と確定した投稿は、新規登録の話ではないので、これらを付けない（detection.ts の evaluateDetection）。
// 保存済みの旧ジョブにはすでに付いているので、管理画面の表示からも除く（answer-view.ts の judgmentReasons）。
// どのイベントのことかを決める店舗・娘・配布物の理由と、状態の理由は含めない。
const NEW_EVENT_ONLY_REASONS: ReadonlySet<string> = new Set([
  'start_date_unspecified',
  'start_date_unconfirmed',
  'end_date_unconfirmed',
  'invalid_date_range',
  'distribution_condition_unspecified',
  'distribution_condition_unconfirmed',
  'purchase_amount_unconfirmed',
  'charge_amount_unconfirmed',
  // 本文の条件の語（会員・提示・予約など）から付く理由。終了・継続の投稿では、新規登録の条件の話ではない。
  'unmodeled_distribution_condition'
])

/** 状態が継続・終了と確定したことを示す理由。 */
const EXISTING_EVENT_REASONS: ReadonlySet<string> = new Set(['existing_event_update', 'event_ended'])

/** 理由に、継続・終了と確定した状態の理由が含まれるか。 */
export const hasExistingEventReason = (reasons: readonly string[]): boolean =>
  reasons.some((reason) => EXISTING_EVENT_REASONS.has(reason))

/** 理由から、新規登録にだけ意味を持つものを除く。元の並びは保ち、元の配列は書き換えない。 */
export const withoutNewEventOnlyReasons = (reasons: readonly string[]): string[] =>
  reasons.filter((reason) => !NEW_EVENT_ONLY_REASONS.has(reason))
