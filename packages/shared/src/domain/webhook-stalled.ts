/**
 * 処理待ち・処理中のまま止まっている webhook ジョブ（候補を含む）の判定。
 * 画面（webhook-labels.ts）とサーバー（webhook-admin.ts）が同じ値・同じ規則で判定するように、ここに一つだけ置く（UI と API は互いに import しない）。
 *
 * 止まっていると見なす最後の更新からの時間（分）。
 * 根拠: キューの再試行は webhook-queue.ts で最大 5 回（wrangler.toml の max_retries）、遅延は 60→120→240→480→960 秒で、合計は約 31 分。
 * 尽きるとデッドレターキューで failed になる。つまり正常な待ち（queued / processing）は、各試行の処理時間を含めても 60 分を超えない。
 * 60 分を超えて queued / processing のままなら、キューのメッセージが失われている（開発サーバーの再起動など）と見なして、人が再実行してよい。
 */
export const WEBHOOK_STALLED_MINUTES = 60

export const WEBHOOK_STALLED_MS = WEBHOOK_STALLED_MINUTES * 60_000

/** 判定を待っている状態（処理待ち・処理中）。 */
export const isWebhookJudgingStatus = (status: string): boolean => status === 'queued' || status === 'processing'

/**
 * 止まっていると見なす最後の更新時刻（ms）の上限。updated_at がこの値以下なら、閾値の時間以上動いていない。
 * SQL の `updated_at<=?` に束縛する値。判定（isStalledWebhookJudging）と SQL が同じ境界になるよう、これを共有する。
 */
export const webhookStalledCutoff = (now: number): number => now - WEBHOOK_STALLED_MS

export type StalledWebhookJudgingInput = {
  status: string
  /** 最後の更新（updated_at、ms）。 */
  updatedAt: number
  /** リースの期限（lease_until、ms）。リースが無い、または画面のように値を持たないときは null。 */
  leaseUntil: number | null
  /** 現在時刻（ms）。 */
  now: number
}

/**
 * 止まっている処理待ち・処理中か。次をすべて満たすとき真。
 * - ステータスが queued か processing。
 * - 最後の更新から閾値（WEBHOOK_STALLED_MINUTES）以上経っている（ちょうど閾値も含む）。
 * - リース中でない（lease_until が無いか、現在時刻より前）。期限が現在時刻ちょうどのときはリース中のまま（SQL の `lease_until<?` と同じ）。
 * 画面は lease_until を持たないため null を渡す。リースの確認は、サーバーの UPDATE の条件が最終的に行う。
 */
export const isStalledWebhookJudging = (input: StalledWebhookJudgingInput): boolean =>
  isWebhookJudgingStatus(input.status) &&
  input.updatedAt <= webhookStalledCutoff(input.now) &&
  (input.leaseUntil === null || input.leaseUntil < input.now)
