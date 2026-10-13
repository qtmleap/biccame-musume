import { filterWebhookPost } from '@biccame/shared/event-detect/detection'
import type { StoreData } from '@biccame/shared/schemas/store.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'

export const webhookAccountLabel = (screenName: string, characters: readonly StoreData[]): string => {
  const character = characters.find((entry) => entry.character.twitter_id?.toLowerCase() === screenName.toLowerCase())
  if (character === undefined) return `@${screenName}`
  return character.character.is_biccame_musume || character.store?.name === undefined
    ? character.character.name
    : character.store.name
}

export const webhookKeywordLabel = (post: WebhookJob['post']): string => {
  const verdict = filterWebhookPost(post)
  if (verdict.reason !== undefined && verdict.reason !== 'no_keyword') return '除外'
  return verdict.hits.length > 0 ? '一致' : '不一致'
}

const POST_STATUS_LABELS = { announce: '告知', start: '開始', ongoing: '継続', end: '終了' } as const

type PostStatusFields = Pick<WebhookJob, 'postStatus' | 'postStatusProbability'>

const percentLabel = (probability: number): string => `${Math.round(probability * 100)}%`

/** 投稿状態を「告知 75%」のようにラベルと確率で表す。対象外判定は却下を優先する。 */
export const webhookPostStatusLabel = (job: Pick<WebhookJob, 'status'> & PostStatusFields): string => {
  if (job.status === 'ignored') return '却下'
  if (job.postStatus === null) return '—'
  const label = POST_STATUS_LABELS[job.postStatus]
  return job.postStatusProbability === null ? label : `${label} ${percentLabel(job.postStatusProbability)}`
}

/** 投稿状態の確信度がしきい値に届かず、確定扱いにできない。 */
export const webhookPostStatusIsTentative = (job: PostStatusFields, threshold: number): boolean =>
  job.postStatus !== null && job.postStatusProbability !== null && job.postStatusProbability < threshold

/** 未確定の理由。しきい値は設定値から表示する。 */
export const webhookPostStatusTentativeReason = (threshold: number): string =>
  `確信度がしきい値(${percentLabel(threshold)})未満のため未確定`

export const webhookModelLabel = (model: WebhookJob['model']): string => (model === null ? '—' : model)

const JOB_LABELS: Readonly<Record<string, string>> = {
  queued: '処理待ち',
  processing: '判定中',
  held: '保留',
  registered: '登録済み',
  ignored: '対象外',
  failed: '処理失敗'
}

const NOTIFICATION_LABELS: Readonly<Record<string, string>> = {
  pending: '通知待ち',
  sent: '通知済み',
  failed: '通知失敗',
  unknown: '送信結果不明',
  skipped: '通知対象外',
  disabled: '通知無効',
  none: '通知対象外'
}

export const webhookJobLabel = (status: string): string => {
  const label = JOB_LABELS[status]
  return label ? label : status
}

export const webhookNotificationLabel = (status: string): string => {
  const label = NOTIFICATION_LABELS[status]
  return label ? label : status
}

export const detectionScoreLabel = (score: number | null): string =>
  score === null ? '—' : `${(score * 100).toFixed(1)}%`

export const webhookActionAvailability = (status: string, notificationStatus: string) => ({
  canResolve: status === 'held',
  canRetryProcessing: status === 'failed',
  canRejudge: status === 'held',
  canRetryNotification:
    (status === 'held' || status === 'registered') &&
    (notificationStatus === 'failed' || notificationStatus === 'unknown')
})

export const notificationRetryWarning = (status: string): string =>
  status === 'unknown'
    ? '前回の送信がDiscordに届いている可能性があります。再送すると同じ通知が重複する場合があります。'
    : 'Discord通知だけを再送します。イベントの登録やAI判定は繰り返しません。'
