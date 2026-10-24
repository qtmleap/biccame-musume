import { actionJob } from '@api/services/webhook-admin'
import { detectionThresholds, runWebhookDetection } from '@api/services/webhook-detection-run'
import { getWebhookJob, releaseWebhookJob, webhookTarget } from '@api/services/webhook-jobs'
import { saveWebhookPromptAttempt } from '@api/services/webhook-prompt'
import type { Bindings } from '@api/types/bindings'
import { DETECTION_VERSION, evaluateDetection } from '@biccame/shared/event-detect/detection'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'

const LEASE_MS = 300_000

/**
 * 登録済みジョブの回答だけを、現在の質問とモデルで更新する（確認用の再判定）。
 * 更新するのは対象行の answers_json・model・question_version・confidence・judged_at・updated_at と、送信入力（requests_json）だけ。
 * 判定状態、event_id、登録候補、理由、判定結果（result_json）、通知、処理回数、イベント本体は変えない。キューにも積まず、通知も送らない。
 * 再判定の規則（rejudgeWebhookJob）とは別で、自動登録済みでも、手動連携の登録済みでも、旧形式の登録済みでも実行できる。
 * AI の失敗・不正な応答・不完全な応答では何も保存せず（送信入力も、全バッチの成功後にまとめて保存する）、502 を返す。
 * 複数候補の投稿は candidateId で候補を選ぶ。先頭の候補を更新したときだけ、親ジョブの回答の写し（一覧の並べ替え・絞り込みが読む列）も合わせる。
 */
export const recheckWebhookJob = async (env: Bindings, postId: string, candidateId?: string) => {
  const parent = await getWebhookJob(env, postId)
  const job = await actionJob(env, postId, candidateId)
  if (job.status !== 'registered') throw new HTTPException(409, { message: 'Only registered jobs can be re-checked' })
  const target = webhookTarget(postId, parent.candidates.length > 0 ? job.eventUUID : undefined)
  const candidate = parent.candidates.find((value) => value.eventUUID === target.id)
  const storeKey = candidate === undefined ? null : candidate.storeKey
  const now = dayjs().valueOf()
  const token = crypto.randomUUID()
  // 判定中に他の処理（再判定、連携、キューの処理）が走らないよう、通常の再判定と同じ方法で投稿のリースを取る。
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
    // リースを取ってから状態を読み直す（読み取りから取得までの間に状態が変わった場合を弾く）。
    const current = await env.DB.prepare(`SELECT status FROM ${target.table} WHERE ${target.column}=?`)
      .bind(target.id)
      .first<string>('status')
    if (current !== 'registered') throw new HTTPException(409, { message: 'Only registered jobs can be re-checked' })
    const { run, confidence } = await (async () => {
      try {
        // 送信入力はここでは保存しない。全バッチが成功してから保存し、失敗時に元の送信入力を残す。
        const run = await runWebhookDetection(env, job.post, storeKey, async () => {})
        const decision = evaluateDetection(
          job.post,
          run.request,
          run.response,
          detectionThresholds(run.configuration),
          storeKey
        )
        return { run, confidence: decision.confidence }
      } catch (error) {
        console.error(
          '[webhook-recheck]',
          JSON.stringify({ postId, target: target.id, error: error instanceof Error ? error.message : 'unknown' })
        )
        throw new HTTPException(502, { message: 'AI re-check failed', cause: error })
      }
    })()
    await saveWebhookPromptAttempt(env, target, token, DETECTION_VERSION, run.requests)
    const answers = JSON.stringify(run.response.answers)
    const judgedAt = dayjs().valueOf()
    const mirrorsParent = target.table === 'webhook_event_candidates' && parent.candidates[0]?.eventUUID === target.id
    const updates = await env.DB.batch([
      env.DB.prepare(
        `UPDATE ${target.table} SET answers_json=?,model=?,question_version=?,confidence=?,judged_at=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`
      ).bind(answers, run.configuration.model, DETECTION_VERSION, confidence, judgedAt, judgedAt, target.id, token),
      ...(mirrorsParent
        ? [
            env.DB.prepare(
              `UPDATE webhook_event_jobs SET answers_json=?,model=?,question_version=?,confidence=?,judged_at=?,updated_at=?
              WHERE post_id=? AND lease_token=? AND EXISTS (SELECT 1 FROM webhook_event_candidates WHERE event_uuid=? AND lease_token=?)`
            ).bind(
              answers,
              run.configuration.model,
              DETECTION_VERSION,
              confidence,
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
    if (updates.some((update) => update.meta.changes !== 1)) throw new Error('Webhook re-check lease lost')
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
