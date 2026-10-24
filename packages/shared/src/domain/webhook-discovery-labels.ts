import type { WebhookDiscovery, WebhookDiscoveryFilter } from '../schemas/webhook.dto'

const RELEVANCE_LABELS = {
  detected: '検出済み',
  uncertain: '判定未確定',
  not_detected: '対象外',
  unrecorded: '検出の記録なし'
} as const satisfies Record<WebhookDiscoveryFilter, string>
const ACTION_LABELS = {
  create: '新規登録候補',
  update: '既存イベントの更新情報',
  end: '終了情報',
  review: '情報を確認',
  none: '登録対象なし'
} as const satisfies Record<WebhookDiscovery['action'], string>
const FIELD_LABELS: ReadonlyMap<string, string> = new Map([
  ['event', 'ビッカメ娘のイベントか'],
  ['status', '投稿状態'],
  ['category', '対象物の種類'],
  ['stores', '開催・配布店舗'],
  ['store', '開催・配布店舗'],
  ['characterIds', '対象ビッカメ娘'],
  ['character', '対象ビッカメ娘'],
  ['startDate', '開始日'],
  ['start_date', '開始日'],
  ['endDate', '終了日'],
  ['end_date', '終了日'],
  ['conditions', '入手条件'],
  ['condition', '入手条件'],
  ['purchase_amount', '購入金額'],
  ['charge_amount', '入金金額'],
  ['quantity', '配布数量'],
  ['itemCountAudit', '配布物件数の監査']
])
const EVIDENCE_LABELS: ReadonlyMap<string, string> = new Map([
  ['canonical_official_account', '正規店舗アカウントの投稿'],
  ['named_character_object', '本文内のビッカメ娘名・対象物を検出'],
  ['explicit_own_object', '本人の対象物であることを本文に明記'],
  ['official_card_distribution', '正規店舗からの名刺配布案内'],
  ['character_display_operation', 'ビッカメ娘の展示・入替・終了の案内'],
  ['explicit_character_anniversary_event', '店舗・ビッカメ娘の記念企画を明記'],
  ['explicit_event_operation', '配布・販売・展示等の実施情報を明記'],
  ['model_event_confirmed', 'AIがイベントと判定（しきい値以上）']
])
export const webhookDiscoveryEvidenceLabel = (evidence: string): string => {
  const label = EVIDENCE_LABELS.get(evidence)
  return label === undefined ? evidence : label
}
export const webhookDiscoveryFilterLabel = (value: WebhookDiscoveryFilter): string => RELEVANCE_LABELS[value]
export const webhookDiscoveryLabel = (discovery: WebhookDiscovery | null | undefined): string =>
  discovery === null || discovery === undefined ? RELEVANCE_LABELS.unrecorded : RELEVANCE_LABELS[discovery.relevance]
export const webhookDiscoveryActionLabel = (action: WebhookDiscovery['action']): string => ACTION_LABELS[action]
export const webhookMissingFieldLabel = (field: string): string => {
  const label = FIELD_LABELS.get(field)
  return label === undefined ? field : label
}
