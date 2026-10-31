import { detectionConfiguration } from '@api/services/webhook-config'
import { detectionThresholds } from '@api/services/webhook-detection-run'
import type { WebhookTarget } from '@api/services/webhook-jobs'
import { applyWebhookLink } from '@api/services/webhook-link'
import type { Bindings } from '@api/types/bindings'
import { AUTO_LINKED_REASON } from '@biccame/shared/domain/webhook-rejudge'
import { autoLinkKind, autoLinkThreshold } from '@biccame/shared/event-detect/linked-event-auto'
import type { WebhookJob, WebhookLinkedEvent } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'

/** 自動連携の書き込みを諦めて人に回してよい失敗。連携先が無い（404）と、リース・連携先の版が読み取りの後に変わった（409）だけ。 */
const isLinkConflict = (error: unknown): boolean =>
  error instanceof HTTPException && (error.status === 404 || error.status === 409)

/**
 * 判定が保留になった終了・継続の候補を、提案された連携先へ自動で連携する。連携したら true、人に回す（保留のまま）なら false。
 * 連携するのは、次をすべて満たすときだけ。
 * - 提案がある（3段目の結果）。
 * - 保留の理由が状態だけ（event_ended か existing_event_update。autoLinkKind）。店舗・娘・重複などほかの理由があれば人が見る。
 * - 提案の確率が autoLinkThreshold（選択肢項目の共通のしきい値と提案の下限の大きい方）以上。
 * 書き込みは手動の連携と同じ applyWebhookLink（同じ D1 batch・同じ条件）で、更新前の状態は処理中（processing）、理由は auto_linked。
 * 通知は出さない（notification_status は skipped）。イベントを新規登録したわけではないので、Discord に「登録しました」を送らない。
 * 連携先が無い・リースを失った・連携先が読み取りの後に変わった（404 / 409）ときは、警告だけを残して false を返し、呼び出し側が通常どおり保留にする。
 * それ以外の例外（D1 の予期しない失敗など）は握りつぶさず、そのまま投げる。
 * 設定（しきい値）は、提案があり理由が条件を満たすときだけ読む。保存済みの結果を使う再試行でも、そのときの現在の設定で比べる。
 */
export const autoLinkWebhookCandidate = async (
  env: Bindings,
  input: {
    job: WebhookJob
    target: WebhookTarget
    token: string
    reasons: readonly string[]
    proposal: WebhookLinkedEvent | undefined
  }
): Promise<boolean> => {
  const { job, target, token, reasons, proposal } = input
  const kind = autoLinkKind(reasons)
  if (proposal === undefined || kind === null) return false
  const { fieldThreshold } = detectionThresholds(await detectionConfiguration(env))
  if (proposal.probability < autoLinkThreshold(fieldThreshold)) return false
  const warn = (message: string) =>
    console.warn(
      '[webhook-auto-link]',
      JSON.stringify({ message, postId: job.postId, candidateId: target.id, eventId: proposal.eventId })
    )
  // 連携先が無いまま batch に進むと、参照URLの外部キーで予期しない D1 の失敗になるので、先に確かめて人に回す。
  if ((await env.DB.prepare('SELECT id FROM events WHERE id=?').bind(proposal.eventId).first()) === null) {
    warn('Auto link skipped because the proposed event no longer exists')
    return false
  }
  try {
    await applyWebhookLink(env, {
      job,
      eventId: proposal.eventId,
      target,
      token,
      now: dayjs().valueOf(),
      previousStatus: 'processing',
      ended: kind === 'ended',
      reason: AUTO_LINKED_REASON,
      notificationStatus: 'skipped'
    })
    return true
  } catch (error) {
    if (!isLinkConflict(error)) throw error
    warn('Auto link skipped because the link could not be applied; leaving the candidate held')
    return false
  }
}
