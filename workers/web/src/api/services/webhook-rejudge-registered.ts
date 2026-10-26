import { detectionThresholds, runWebhookDetection } from '@api/services/webhook-detection-run'
import { recordWebhookDiscovery } from '@api/services/webhook-discovery-record'
import { webhookItemCountReviewReasons } from '@api/services/webhook-item-count-review'
import { getWebhookCandidate, getWebhookJob, releaseWebhookJob, webhookTarget } from '@api/services/webhook-jobs'
import { saveWebhookPromptAttempt } from '@api/services/webhook-prompt'
import type { Bindings } from '@api/types/bindings'
import { isAutoRegisteredWebhookJob } from '@biccame/shared/domain/webhook-rejudge'
import { DETECTION_VERSION, evaluateDetection } from '@biccame/shared/event-detect/detection'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'

const LEASE_MS = 300_000

/** 人の却下（reasons に manually_rejected）は上書きしない。自動登録済み（manually_linked なし）以外は、この処理の対象ではない。 */
const assertRejudgeable = (status: string, reasons: readonly string[]) => {
  if (reasons.includes('manually_rejected'))
    throw new HTTPException(409, { message: 'Manually rejected jobs cannot be re-judged' })
  if (!isAutoRegisteredWebhookJob(status, reasons))
    throw new HTTPException(409, { message: 'This job cannot be re-judged' })
}

/**
 * 自動登録済みのジョブを、現在の設定（モデル・3 つのしきい値・項目別しきい値）で判定し直す（画面の「再実行」のうち自動登録済みの場合）。
 * queued に戻して処理し直すと、同じ event.uuid の INSERT が主キーで衝突して失敗し、通知も再び起こりうるため、この関数は登録を一切変えない。
 * 更新するのは対象行の answers_json・model・question_version・confidence・judged_at・updated_at、送信入力（requests_json）、
 * 判定結果（result_json。現在のしきい値で evaluateDetection をやり直した結果と、それから作り直した発見記録 discovery）だけ。
 * 判定状態（registered のまま）、event_id、登録候補、理由、通知の状態と履歴、処理回数、semantic_key、イベント本体（events と関連表）は変えない。
 * キューにも積まず、Discord / X へも送らない。
 * やり直した判定が held / ignored になっても registered のまま。登録後に人がイベントを直している可能性があるため、結果は result_json にだけ残す。
 * このため result_json の判定は、登録した時点の判定と食い違いうる。
 * 発見記録は、保存済みの理由（reasons_json）ではなく、やり直した判定の理由から作る（synchronizeWebhookDiscovery は通さない）。
 * AI の失敗・不正な応答・不完全な応答では何も保存せず（送信入力も、全バッチの成功後にまとめて保存する）、502 を返す。
 * 複数候補の投稿は呼び出し側が選んだ候補（job）を更新する。先頭の候補を更新したときだけ、親ジョブの回答の写し（一覧の並べ替え・絞り込みが読む列）も合わせる。
 */
export const rejudgeRegisteredWebhookJob = async (
  env: Bindings,
  postId: string,
  parent: WebhookJob,
  job: WebhookJob
): Promise<WebhookJob> => {
  assertRejudgeable(job.status, job.reasons)
  const target = webhookTarget(postId, parent.candidates.length > 0 ? job.eventUUID : undefined)
  const candidate = parent.candidates.find((value) => value.eventUUID === target.id)
  const storeKey = candidate === undefined ? null : candidate.storeKey
  const now = dayjs().valueOf()
  const token = crypto.randomUUID()
  // 判定中に他の処理（再実行、連携、キューの処理）が走らないよう、通常の再実行と同じ方法で投稿のリースを取る。
  const lock = await env.DB.prepare(
    'UPDATE webhook_event_jobs SET lease_token=?,lease_until=? WHERE post_id=? AND (lease_until IS NULL OR lease_until<?)'
  )
    .bind(token, now + LEASE_MS, postId, now)
    .run()
  if (lock.meta.changes !== 1) throw new HTTPException(409, { message: 'Job is being processed' })
  try {
    if (target.table === 'webhook_event_candidates') {
      const childClaim = await env.DB.prepare(
        'UPDATE webhook_event_candidates SET lease_token=?,lease_until=? WHERE event_uuid=? AND (lease_until IS NULL OR lease_until<?)'
      )
        .bind(token, now + LEASE_MS, target.id, now)
        .run()
      if (childClaim.meta.changes !== 1) throw new HTTPException(409, { message: 'Candidate is being processed' })
    }
    // リースを取ってから状態と理由を読み直す（読み取りから取得までの間に、連携や却下で変わった場合を弾く）。
    const current =
      target.table === 'webhook_event_candidates'
        ? await getWebhookCandidate(env, postId, target.id)
        : await getWebhookJob(env, postId)
    assertRejudgeable(current.status, current.reasons)
    // 件数の監査は保存済みの抽出結果から決まり、AI を呼ばない。通常の判定（webhook-candidate-process.ts）と同じく、保存済みの判定結果を前提にしない。
    const auditReasons = await webhookItemCountReviewReasons(env, postId, { post: current.post, resultJson: null })
    const judged = await (async () => {
      try {
        // 送信入力はここでは保存しない。全バッチが成功してから保存し、失敗時に元の送信入力を残す。
        const run = await runWebhookDetection(env, current.post, storeKey, async () => {})
        // しきい値は、今回の実行で読んだ現在の設定から作る。保存済みの判定結果のしきい値は使わない。
        const thresholds = detectionThresholds(run.configuration)
        const decision = evaluateDetection(current.post, run.request, run.response, thresholds, storeKey)
        const discovery = recordWebhookDiscovery(current.post, run.response.answers, decision, thresholds, auditReasons)
        return { run, decision, discovery }
      } catch (error) {
        console.error(
          '[webhook-rejudge-registered]',
          JSON.stringify({ postId, target: target.id, error: error instanceof Error ? error.message : 'unknown' })
        )
        throw new HTTPException(502, { message: 'AI re-judge failed', cause: error })
      }
    })()
    const { run, decision, discovery } = judged
    await saveWebhookPromptAttempt(env, target, token, DETECTION_VERSION, run.requests)
    const answers = JSON.stringify(run.response.answers)
    const judgedAt = dayjs().valueOf()
    const mirrorsParent = target.table === 'webhook_event_candidates' && parent.candidates[0]?.eventUUID === target.id
    const updates = await env.DB.batch([
      env.DB.prepare(
        `UPDATE ${target.table} SET result_json=?,answers_json=?,model=?,question_version=?,confidence=?,judged_at=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`
      ).bind(
        JSON.stringify({ ...decision, discovery }),
        answers,
        run.configuration.model,
        DETECTION_VERSION,
        decision.confidence,
        judgedAt,
        judgedAt,
        target.id,
        token
      ),
      ...(mirrorsParent
        ? [
            // 親ジョブの写しは、候補の行と同じ列のうち判定結果（result_json）と送信入力（requests_json）を除いたもの。親にはこの 2 列を写していない。
            env.DB.prepare(
              `UPDATE webhook_event_jobs SET answers_json=?,model=?,question_version=?,confidence=?,judged_at=?,updated_at=?
              WHERE post_id=? AND lease_token=? AND EXISTS (SELECT 1 FROM webhook_event_candidates WHERE event_uuid=? AND lease_token=?)`
            ).bind(
              answers,
              run.configuration.model,
              DETECTION_VERSION,
              decision.confidence,
              judgedAt,
              judgedAt,
              postId,
              token,
              target.id,
              token
            )
          ]
        : [])
    ])
    if (updates.some((update) => update.meta.changes !== 1)) throw new Error('Webhook re-judge lease lost')
  } finally {
    if (target.table === 'webhook_event_candidates')
      await env.DB.prepare(
        'UPDATE webhook_event_candidates SET lease_token=NULL,lease_until=NULL WHERE event_uuid=? AND lease_token=?'
      )
        .bind(target.id, token)
        .run()
    await releaseWebhookJob(env, postId, token)
  }
  return getWebhookJob(env, postId)
}
