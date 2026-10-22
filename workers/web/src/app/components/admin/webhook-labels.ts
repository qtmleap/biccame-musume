import { type WebhookKeywordVerdict, webhookKeywordVerdict } from '@biccame/shared/event-detect/detection'
import type { StoreData } from '@biccame/shared/schemas/store.dto'
import type { WebhookCandidate, WebhookJob, WebhookPostStatusFilter } from '@biccame/shared/schemas/webhook.dto'

/** 候補の表示名。登録済みなら登録イベントの題、無ければ保存済みの登録候補の題（AI が付けた題を含む）、無ければ抽出名。 */
export const webhookCandidateTitle = (
  candidate: Pick<WebhookCandidate, 'eventTitle' | 'candidate' | 'item'>
): string => {
  if (candidate.eventTitle !== null) return candidate.eventTitle
  return candidate.candidate === null ? candidate.item : candidate.candidate.title
}

export const webhookAccountLabel = (screenName: string, characters: readonly StoreData[]): string => {
  const character = characters.find((entry) => entry.character.twitter_id?.toLowerCase() === screenName.toLowerCase())
  if (character === undefined) return `@${screenName}`
  return character.character.is_biccame_musume || character.store?.name === undefined
    ? character.character.name
    : character.store.name
}

const KEYWORD_VERDICT_LABELS = {
  match: '一致',
  mismatch: '不一致',
  excluded: '除外'
} as const satisfies Record<WebhookKeywordVerdict, string>

/** 判定の表示名。一覧の「判定」列と絞り込みの選択肢が同じ表示を使う。 */
export const webhookKeywordVerdictLabel = (verdict: WebhookKeywordVerdict): string => KEYWORD_VERDICT_LABELS[verdict]

export const webhookKeywordLabel = (post: WebhookJob['post']): string =>
  webhookKeywordVerdictLabel(webhookKeywordVerdict(post))

const POST_STATUS_LABELS = { announce: '告知', start: '開始', ongoing: '継続', end: '終了' } as const
const IGNORED_POST_STATUS_LABEL = '却下'

type PostStatusFields = Pick<WebhookJob, 'postStatus' | 'postStatusProbability'>

const percentLabel = (probability: number): string => `${Math.round(probability * 100)}%`

/**
 * 投稿状態を「告知」のようにラベルだけで表す。確率は付けない（未確定は一覧で薄い文字色とツールチップが示し、確率は詳細で見る）。
 * 対象外判定は却下を優先する。
 */
export const webhookPostStatusLabel = (job: Pick<WebhookJob, 'status'> & PostStatusFields): string => {
  if (job.status === 'ignored') return IGNORED_POST_STATUS_LABEL
  if (job.postStatus === null) return '—'
  return POST_STATUS_LABELS[job.postStatus]
}

/** ステータスの絞り込みの選択肢の表示名。「ステータス」列の表示（webhookPostStatusLabel）と同じ文言。 */
export const webhookPostStatusFilterLabel = (postStatus: WebhookPostStatusFilter): string =>
  postStatus === 'ignored' ? IGNORED_POST_STATUS_LABEL : POST_STATUS_LABELS[postStatus]

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

/**
 * 再判定できるのは保留、人が却下していない対象外、手動で連携した登録済み（reasons に manually_linked）のジョブ。
 * 人の却下（reasons に manually_rejected）は再判定で上書きしない。自動登録された登録済みは、作成済みのイベントが重複しうるため再判定できない。
 * サーバー側の rejudgeWebhookJob（webhook-admin.ts）と同じ規則。
 */
const canRejudgeJob = (status: string, reasons: readonly string[]): boolean =>
  status === 'held' ||
  (status === 'ignored' && !reasons.includes('manually_rejected')) ||
  (status === 'registered' && reasons.includes('manually_linked'))

/**
 * 連携できるのは保留と対象外、および登録済み（連携先の付け替え）。サーバー側の resolveWebhookJob（webhook-admin.ts）と同じ規則。
 */
const canLinkJob = (status: string): boolean => status === 'held' || status === 'ignored' || status === 'registered'

/**
 * 確認用に再判定できるのは登録済みのジョブだけ。回答・確率・プロンプトの版・判定モデルを更新するだけで、イベント・判定状態・通知は変えない。
 * サーバー側の recheckWebhookJob（webhook-recheck.ts）と同じ規則。通常の再判定（canRejudge）とは独立している。
 */
const canRecheckJob = (status: string): boolean => status === 'registered'

export const webhookActionAvailability = (status: string, notificationStatus: string, reasons: readonly string[]) => ({
  canResolve: status === 'held',
  canLink: canLinkJob(status),
  canRetryProcessing: status === 'failed',
  canRejudge: canRejudgeJob(status, reasons),
  canRecheck: canRecheckJob(status),
  canRetryNotification:
    (status === 'held' || status === 'registered') &&
    (notificationStatus === 'failed' || notificationStatus === 'unknown')
})

/** キューの判定結果を待っている状態。回答はまだ無い（再判定直後は answers も空になる）。 */
export const isWebhookJobJudging = (status: string): boolean => status === 'queued' || status === 'processing'

/**
 * 結果がまだ動いている最中のジョブ。判定待ち（queued / processing）か、判定後の Discord 通知待ち（pending）。
 * failed と、通知が sent / skipped / failed / unknown に着いたものは終端とみなす。
 */
export const isWebhookJobInProgress = (status: string, notificationStatus: string): boolean =>
  isWebhookJobJudging(status) || ((status === 'held' || status === 'registered') && notificationStatus === 'pending')

/** 進行中の詳細を再取得する間隔(ms)。 */
export const WEBHOOK_JOB_POLL_INTERVAL_MS = 2000
/** 進行中が続いたときに、再取得を諦めるまでの時間(ms)。キュー停止や通知の長期リトライで張り付かないための上限。 */
export const WEBHOOK_JOB_POLL_TIMEOUT_MS = 3 * 60 * 1000

/** 進行中の起点。phase は現在が判定待ちか通知待ちか、startedAt は進行中になって最初に見た時刻(ms)。 */
export type WebhookJobPollWindow = { phase: 'judging' | 'notifying'; startedAt: number }

export type WebhookJobPoll = {
  /** 次回に引き継ぐ起点。進行中でなければ null。 */
  window: WebhookJobPollWindow | null
  /** 再取得の間隔(ms)。false なら止める。 */
  interval: number | false
}

/**
 * 詳細の再取得間隔と、次回に引き継ぐ起点を決める純関数。
 * - データが無い・進行中でなければ起点を捨てて止める（次の進行中でまた新しく3分数える）。
 * - 進行中が続く間は起点を保ち、起点から3分未満だけ2秒間隔にする。判定待ち → 通知待ちへ進んでも数え直さない（合計で3分）。
 * - 例外として、通知待ちから判定待ちへ戻ったとき（通知待ちが3分で打ち切られた後の再判定など）は今の時刻から数え直す。
 *   通知待ちのまま再判定しても「進行中でなくなる」瞬間が無く、起点が残り続けて二度と再取得されなくなるため。
 */
export const webhookJobPoll = (
  previous: WebhookJobPollWindow | null,
  job: { status: string; notificationStatus: string } | undefined,
  now: number
): WebhookJobPoll => {
  if (job === undefined || !isWebhookJobInProgress(job.status, job.notificationStatus)) {
    return { window: null, interval: false }
  }
  const phase: WebhookJobPollWindow['phase'] = isWebhookJobJudging(job.status) ? 'judging' : 'notifying'
  const restarted = previous === null || (previous.phase === 'notifying' && phase === 'judging')
  const pollWindow: WebhookJobPollWindow = restarted
    ? { phase, startedAt: now }
    : { phase, startedAt: previous.startedAt }
  return {
    window: pollWindow,
    interval: now - pollWindow.startedAt < WEBHOOK_JOB_POLL_TIMEOUT_MS ? WEBHOOK_JOB_POLL_INTERVAL_MS : false
  }
}

export const notificationRetryWarning = (status: string): string =>
  status === 'unknown'
    ? '前回の送信がDiscordに届いている可能性があります。再送すると同じ通知が重複する場合があります。'
    : 'Discord通知だけを再送します。イベントの登録やAI判定は繰り返しません。'
