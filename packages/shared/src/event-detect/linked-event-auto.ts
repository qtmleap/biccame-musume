import { LINKED_EVENT_THRESHOLD } from './linked-event'

/** 保留の理由のうち、自動連携の判断に入れない情報用の理由（タイトルを付けた結果。webhook-candidate-process.ts が付ける）。 */
const INFORMATIONAL_REASONS: ReadonlySet<string> = new Set(['title_generated', 'title_fallback'])

/**
 * 自動連携に必要な確率の下限（ちょうどは連携する）。選択肢項目の共通のしきい値（detectionThresholds の fieldThreshold。既定 0.9）と、
 * 提案の下限（LINKED_EVENT_THRESHOLD）の大きい方。
 * 提案の下限は「人が見る候補」として残す線なので、自動で連携する線は、選択肢項目の確定の線より緩めない。
 * 新しい設定項目は作らない。管理画面でしきい値を下げても、提案の下限より低くは連携しない。
 */
export const autoLinkThreshold = (fieldThreshold: number): number => Math.max(fieldThreshold, LINKED_EVENT_THRESHOLD)

/**
 * 保留の理由が状態だけ（event_ended か existing_event_update のちょうど 1 つ）のときの、連携の種類。
 * 終了（event_ended）は ended、継続（existing_event_update）は ongoing。状態の理由以外が 1 つでもあれば（店舗・娘・配布物の未確定、
 * possible_duplicate / possible_duplicate_post など）null で、自動では連携せず人が見る。
 * title_generated / title_fallback は、タイトルを付けた結果の情報用の理由なので数えない。
 */
export const autoLinkKind = (reasons: readonly string[]): 'ended' | 'ongoing' | null => {
  const substantive = [...new Set(reasons.filter((reason) => !INFORMATIONAL_REASONS.has(reason)))]
  if (substantive.length !== 1) return null
  if (substantive[0] === 'event_ended') return 'ended'
  return substantive[0] === 'existing_event_update' ? 'ongoing' : null
}
