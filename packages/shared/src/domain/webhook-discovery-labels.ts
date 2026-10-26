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
export const webhookDiscoveryFilterLabel = (value: WebhookDiscoveryFilter): string => RELEVANCE_LABELS[value]
export const webhookDiscoveryLabel = (discovery: WebhookDiscovery | null | undefined): string =>
  discovery === null || discovery === undefined ? RELEVANCE_LABELS.unrecorded : RELEVANCE_LABELS[discovery.relevance]
export const webhookDiscoveryActionLabel = (action: WebhookDiscovery['action']): string => ACTION_LABELS[action]
export const webhookMissingFieldLabel = (field: string): string => {
  const label = FIELD_LABELS.get(field)
  return label === undefined ? field : label
}
