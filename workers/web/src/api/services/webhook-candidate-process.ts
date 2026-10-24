import { detectionThresholds, runWebhookDetection } from '@api/services/webhook-detection-run'
import {
  duplicateWebhookEvents,
  getWebhookCandidate,
  registerWebhookEvent,
  storedJson,
  validateWebhookEvent,
  type WebhookTarget,
  webhookConditionIdentity,
  webhookItemIdentity
} from '@api/services/webhook-jobs'
import { saveWebhookPromptAttempt } from '@api/services/webhook-prompt'
import { generateEventTitle } from '@api/services/webhook-title'
import type { Bindings } from '@api/types/bindings'
import { DETECTION_VERSION, DetectionResultSchema, evaluateDetection } from '@biccame/shared/event-detect/detection'
import dayjs from 'dayjs'
import { canAutoRegisterWebhookCandidate } from './webhook-auto-registration'
import { recordWebhookDiscovery, synchronizeWebhookDiscovery } from './webhook-discovery-record'
import { isLegacyWebhookRegisterRetry, webhookItemCountReviewReasons } from './webhook-item-count-review'
import { NotificationRetry, notifyWebhookJob } from './webhook-notification'
import { eventCandidate, type ProcessOptions } from './webhook-processing-context'

export const processWebhookCandidate = async (
  env: Bindings,
  postId: string,
  token: string,
  options: ProcessOptions,
  target: WebhookTarget,
  item: string,
  storeKey: string | null,
  legacy: boolean
): Promise<number | null> => {
  const currentJob = () => getWebhookCandidate(env, postId, target.id)
  try {
    const job = await currentJob()
    if (job.status === 'registered' || job.status === 'held') {
      await notifyWebhookJob(env, job, token, target)
      return null
    }
    const stored = await env.DB.prepare(
      `SELECT result_json AS resultJson FROM ${target.table} WHERE ${target.column}=?`
    )
      .bind(target.id)
      .first<{ resultJson: string | null }>()
    if (stored === null) throw new Error('Webhook job disappeared')
    const auditReasons = await webhookItemCountReviewReasons(env, postId, {
      post: job.post,
      resultJson: stored.resultJson
    })
    const result =
      stored.resultJson === null
        ? await (async () => {
            // 各送信の直前に、そこまでの送信入力を保存する。全バッチが成功するまで一部の判定だけを保存しない。
            const { configuration, request, response } = await runWebhookDetection(env, job.post, storeKey, (sent) =>
              saveWebhookPromptAttempt(env, target, token, DETECTION_VERSION, sent)
            )
            const decision = evaluateDetection(
              job.post,
              request,
              response,
              detectionThresholds(configuration),
              storeKey
            )
            const discovery = recordWebhookDiscovery(
              job.post,
              response.answers,
              decision,
              detectionThresholds(configuration),
              auditReasons
            )
            await env.DB.prepare(
              `UPDATE ${target.table} SET result_json=?,answers_json=?,model=?,question_version=?,confidence=?,judged_at=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`
            )
              .bind(
                JSON.stringify({ ...decision, discovery }),
                JSON.stringify(response.answers),
                configuration.model,
                DETECTION_VERSION,
                decision.confidence,
                dayjs().valueOf(),
                dayjs().valueOf(),
                target.id,
                token
              )
              .run()
            return decision
          })()
        : (() => {
            const decision = DetectionResultSchema.safeParse(storedJson(stored.resultJson))
            if (!decision.success) throw new Error('Invalid stored AI result')
            return decision.data
          })()
    const candidate =
      result.status === 'ignored' || !result.candidate
        ? null
        : eventCandidate({ ...result.candidate, title: item }, job.eventUUID)
    const duplicates = candidate === null ? [] : await duplicateWebhookEvents(env, candidate, job.sourceUrl, item)
    const judged = await currentJob()
    const discoveryRecorded = judged.discovery !== undefined && judged.discovery !== null
    const allowed =
      auditReasons.length === 0 &&
      (discoveryRecorded || isLegacyWebhookRegisterRetry(job.post, stored.resultJson)) &&
      canAutoRegisterWebhookCandidate(
        job.post,
        result,
        candidate,
        judged.discovery === undefined ? null : judged.discovery
      )
    const baseReasons = [
      ...result.reasons,
      ...auditReasons,
      ...(result.status === 'register' && candidate !== null && !allowed ? ['auto_registration_not_allowed'] : []),
      ...(result.status === 'register' && candidate === null ? ['invalid_event_candidate'] : []),
      ...duplicates.map((id) => `possible_duplicate:${id}`)
    ]
    const canRegister = allowed && duplicates.length === 0
    // 同じ店舗・種別・開始日の別投稿が登録済みなら保留にする。この判定とスロットの予約は、タイトルを付ける（LLM を呼ぶ）前に済ませる。
    const semantic =
      canRegister && candidate !== null
        ? JSON.stringify([
            candidate.stores.slice().sort(),
            candidate.characterIds.slice().sort(),
            candidate.category,
            candidate.startDate,
            webhookItemIdentity(item),
            webhookConditionIdentity(candidate)
          ])
        : null
    const existing =
      semantic === null
        ? null
        : await env.DB.prepare(
            `SELECT event_uuid AS eventUUID,post_id AS postId FROM ${target.table} WHERE semantic_key=?`
          )
            .bind(semantic)
            .first<{ eventUUID: string; postId: string }>()
    const duplicatePostId = existing !== null && existing.eventUUID !== job.eventUUID ? existing.postId : null
    const registering = canRegister && candidate !== null && semantic !== null && duplicatePostId === null
    // 登録に進む投稿は、タイトルの通信（最大 20 秒）より前に同じイベントの枠を押さえる（同じイベントの別投稿が同時に登録に進まないように）。
    if (registering && semantic !== null) {
      await env.DB.prepare(`UPDATE ${target.table} SET semantic_key=? WHERE ${target.column}=? AND lease_token=?`)
        .bind(semantic, target.id, token)
        .run()
    }
    // 登録候補（candidate）が作れたときは、自動登録に進むものも、重複などで保留になるもの（人が補完して登録する）も、
    // イベントのタイトルを Claude に付けさせる。candidate が無い（対象外・日付やカテゴリが決まらない）ときは呼ばない。
    // 配布物の名前（item）を渡して、同じ投稿の配布物どうしで別の題になるようにする。失敗・未設定なら今の形のタイトルのまま。
    // 旧単一ジョブ（移行の印あり）の item は抽出した名前ではなく、旧形式で作った題か仮の名前なので渡さない（本文から読み取らせる）。
    const titled =
      candidate !== null && job.post.extractionContext?.kind !== 'event'
        ? await generateEventTitle(
            env,
            {
              category: candidate.category,
              startDay: candidate.startDate.slice(0, 10),
              stores: candidate.stores,
              body: job.post.text,
              ...(legacy ? {} : { item })
            },
            options.titleFetcher === undefined ? {} : { fetcher: options.titleFetcher }
          )
        : null
    const registered = candidate !== null && titled?.ok ? { ...candidate, title: titled.title } : candidate
    const reasons = [...baseReasons, ...(titled === null ? [] : [titled.ok ? 'title_generated' : 'title_fallback'])]
    await env.DB.prepare(
      `UPDATE ${target.table} SET candidate_json=?,reasons_json=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`
    )
      .bind(
        registered === null ? null : JSON.stringify(registered),
        JSON.stringify(reasons),
        dayjs().valueOf(),
        target.id,
        token
      )
      .run()
    if (registering && registered !== null) {
      await registerWebhookEvent(
        env,
        await currentJob(),
        validateWebhookEvent(registered, job.eventUUID),
        token,
        target
      )
    } else if (duplicatePostId !== null) {
      await env.DB.prepare(
        `UPDATE ${target.table} SET status='held',reasons_json=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`
      )
        .bind(
          JSON.stringify([...reasons, `possible_duplicate_post:${duplicatePostId}`]),
          dayjs().valueOf(),
          target.id,
          token
        )
        .run()
    } else {
      const status = result.status === 'ignored' ? 'ignored' : 'held'
      await env.DB.prepare(
        `UPDATE ${target.table} SET status=?,notification_status=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`
      )
        .bind(status, status === 'ignored' ? 'skipped' : 'pending', dayjs().valueOf(), target.id, token)
        .run()
    }
    const finalJob = await synchronizeWebhookDiscovery(env, await currentJob(), target, token)
    await notifyWebhookJob(env, finalJob, token, target)
    return null
  } catch (error) {
    if (error instanceof NotificationRetry) return error.delay
    await env.DB.prepare(`UPDATE ${target.table} SET status=CASE WHEN status='processing' THEN 'failed' ELSE status END,
      last_error='processing_failed',updated_at=? WHERE ${target.column}=? AND lease_token=?`)
      .bind(dayjs().valueOf(), target.id, token)
      .run()
    throw error
  }
}
