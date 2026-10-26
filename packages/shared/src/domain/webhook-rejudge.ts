/**
 * 自動登録された登録済み（パイプラインが作ったイベントを持つ）ジョブか。
 * 登録済みのうち、人が連携した（reasons に manually_linked がある）ものを除く。
 * 「再実行」は、このジョブを queued に戻さず、登録を変えないまま判定だけを現在の設定でやり直す。
 * 画面（webhook-labels.ts）とサーバー（webhook-admin.ts）が同じ規則で振り分けるように、ここに一つだけ置く。
 */
export const isAutoRegisteredWebhookJob = (status: string, reasons: readonly string[]): boolean =>
  status === 'registered' && !reasons.includes('manually_linked')
