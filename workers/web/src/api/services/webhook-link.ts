import { recoverSocialJobs } from '@api/services/social-posting'
import type { WebhookTarget } from '@api/services/webhook-jobs'
import { planEndedLink } from '@api/services/webhook-link-ended'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import type { LinkedWebhookReason } from '@biccame/shared/domain/webhook-rejudge'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import { HTTPException } from 'hono/http-exception'

export type WebhookLinkInput = {
  /** 連携する投稿（候補）。投稿の URL・日時を、連携先の参照URL・終了日に使う。 */
  job: WebhookJob
  /** 連携先の既存イベント。 */
  eventId: string
  target: WebhookTarget
  /** 投稿のリースのトークン。ジョブ行の更新と、連携先の書き込みの条件に使う。 */
  token: string
  now: number
  /** 更新前のジョブ行の状態。手動の連携は job.status、判定の最中の自動連携は processing。この状態でなければ batch 全体が空振りする。 */
  previousStatus: string
  /** 終了判定の投稿か。true のときだけ、連携先の終了（end 参照URL・ended_at・更新投稿）も同じ batch で反映する（planEndedLink）。 */
  ended: boolean
  /** ジョブ行に残す理由。手動は manually_linked、自動は auto_linked。 */
  reason: LinkedWebhookReason
  /** 未登録のジョブを連携したときの通知の状態。手動は pending（Discord へ通知する）、自動は skipped（イベントを新規登録したわけではないので通知しない）。 */
  notificationStatus: 'pending' | 'skipped'
}

/**
 * 投稿を既存のイベントへ連携する。手動の連携（resolveWebhookJob）と自動の連携（判定の最後）が、同じ D1 batch・同じ条件で行う。
 * 連携は連携先のイベント本体を変えず、announce の参照URLを足してジョブ行を registered にするだけ。
 * 例外は終了判定の投稿（ended）で、end 参照URL・ended_at・更新投稿も同じ batch で反映する（planEndedLink）。
 * リース・更新前の状態・連携先の版のいずれかが読み取りの後に変わっていれば、参照URLも含めて何も反映されず、HTTPException(409) を投げる。
 * 終了の投稿で連携先が無いときは HTTPException(404)（planEndedLink が読み取りで気づく）。継続の投稿は連携先を読まず、無いと参照URLの外部キーで失敗するので、呼び出し側が先に存在を確かめる。
 * 呼び出し側がリースの取得・解放と親ジョブの集約を行う。
 * 登録済みの連携し直し（付け替え）は通知の状態を変えない（Discord への再通知を起こさない）。
 * 終了の投稿を反映して更新投稿を予約したときは、batch の成功後に投稿ジョブの回収を試みる（失敗しても pending の投稿ジョブは cron が回収する）。
 */
export const applyWebhookLink = async (env: Bindings, input: WebhookLinkInput): Promise<void> => {
  const { job, eventId, target, token, now, previousStatus } = input
  const ended = input.ended
    ? await planEndedLink(env, { job, status: previousStatus, eventId, target, token, now })
    : null
  const update = env.DB.prepare(
    // 右辺の status は更新前の値。
    `UPDATE ${target.table} SET status='registered',event_id=?,reasons_json=?,
      notification_status=CASE WHEN status='registered' THEN notification_status ELSE ? END,
      notification_error=CASE WHEN status='registered' THEN notification_error ELSE NULL END,
      updated_at=? WHERE ${target.column}=? AND lease_token=? AND status=?${ended === null ? '' : ended.guard.sql}`
  ).bind(
    eventId,
    JSON.stringify([input.reason]),
    input.notificationStatus,
    now,
    target.id,
    token,
    previousStatus,
    ...(ended === null ? [] : ended.guard.values)
  )
  const references =
    ended === null
      ? [
          env.DB.prepare(`INSERT INTO event_reference_urls (id,event_id,type,url,created_at,updated_at)
          SELECT ?,?,'announce',?,?,? WHERE NOT EXISTS (SELECT 1 FROM event_reference_urls WHERE event_id=? AND url=?)
          AND EXISTS (SELECT 1 FROM ${target.table} WHERE ${target.column}=? AND lease_token=? AND status=?)`).bind(
            crypto.randomUUID(),
            eventId,
            job.sourceUrl,
            toD1DateTime(now),
            toD1DateTime(now),
            eventId,
            job.sourceUrl,
            target.id,
            token,
            previousStatus
          )
        ]
      : []
  const result = await env.DB.batch([...references, ...(ended === null ? [] : ended.statements), update])
  if (result.at(-1)?.meta.changes !== 1)
    throw ended === null ? new HTTPException(409, { message: 'Job lease lost' }) : await ended.conflict()
  // Queue 投入は commit 後。失敗しても pending の投稿ジョブは cron が回収する。
  if (ended?.writesEndedAt)
    await recoverSocialJobs(env).catch(() => console.error('[social] post-link queue recovery failed'))
}
