/** 人が連携した（管理画面の「連携」）ことを表す理由。 */
export const MANUALLY_LINKED_REASON = 'manually_linked'
/** 判定が保留になった終了・継続の投稿を、提案された連携先へ自動で連携したことを表す理由。 */
export const AUTO_LINKED_REASON = 'auto_linked'
/** 連携したジョブの印になる理由（手動・自動）。文字列の比較を散らさず、連携かどうかはここを通す。 */
export const LINKED_WEBHOOK_REASONS = [MANUALLY_LINKED_REASON, AUTO_LINKED_REASON] as const
export type LinkedWebhookReason = (typeof LINKED_WEBHOOK_REASONS)[number]

/**
 * 連携したジョブか。登録済みで、reasons に手動・自動どちらかの連携の理由があるもの。
 * 連携は連携先のイベント本体を作らない（event_id に既存のイベントを結ぶだけ）ので、自動登録とは別に扱う。
 */
export const isLinkedWebhookJob = (status: string, reasons: readonly string[]): boolean =>
  status === 'registered' && LINKED_WEBHOOK_REASONS.some((reason) => reasons.includes(reason))

/**
 * 自動登録された登録済み（パイプラインが作ったイベントを持つ）ジョブか。
 * 登録済みのうち、連携した（reasons に manually_linked か auto_linked がある）ものを除く。
 * 「再実行」は、このジョブを queued に戻さず、登録を変えないまま判定だけを現在の設定でやり直す。
 * 画面（webhook-labels.ts）とサーバー（webhook-admin.ts）が同じ規則で振り分けるように、ここに一つだけ置く。
 */
export const isAutoRegisteredWebhookJob = (status: string, reasons: readonly string[]): boolean =>
  status === 'registered' && !isLinkedWebhookJob(status, reasons)
