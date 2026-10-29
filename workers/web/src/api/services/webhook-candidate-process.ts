import { detectionThresholds, runWebhookDetection } from '@api/services/webhook-detection-run'
import { inWebhookStage, markWebhookStage } from '@api/services/webhook-failure-stage'
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
import { proposeWebhookLinkedEvent } from '@api/services/webhook-linked-event'
import { saveWebhookPromptAttempt } from '@api/services/webhook-prompt'
import { generateEventTitle } from '@api/services/webhook-title'
import type { Bindings } from '@api/types/bindings'
import {
  DETECTION_VERSION,
  DetectionResultSchema,
  evaluateDetection,
  isLinkedEventAction
} from '@biccame/shared/event-detect/detection'
import dayjs from 'dayjs'
import { canAutoRegisterWebhookCandidate } from './webhook-auto-registration'
import { recordWebhookDiscovery, synchronizeWebhookDiscovery } from './webhook-discovery-record'
import { webhookProcessingErrorCode } from './webhook-extraction'
import { isLegacyWebhookRegisterRetry } from './webhook-item-count-review'
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
      await inWebhookStage('notification', () => notifyWebhookJob(env, job, token, target))
      return null
    }
    const stored = await env.DB.prepare(
      `SELECT result_json AS resultJson FROM ${target.table} WHERE ${target.column}=?`
    )
      .bind(target.id)
      .first<{ resultJson: string | null }>()
    if (stored === null) throw new Error('Webhook job disappeared')
    const result =
      stored.resultJson === null
        ? await (async () => {
            // 各送信の直前に、そこまでの送信入力を保存する。全バッチが成功するまで一部の判定だけを保存しない。
            // 失敗の段階を残すため、Clef の判定と送信入力の保存は別の段階にする（内側の prompt_save が先に付く）。
            const run = await inWebhookStage('detection', () =>
              runWebhookDetection(env, job.post, storeKey, (sent) =>
                inWebhookStage('prompt_save', () =>
                  saveWebhookPromptAttempt(env, target, token, DETECTION_VERSION, sent)
                )
              )
            )
            const { configuration, request, response } = run
            const decision = evaluateDetection(
              job.post,
              request,
              response,
              detectionThresholds(configuration),
              storeKey
            )
            const recorded = recordWebhookDiscovery(
              job.post,
              response.answers,
              decision,
              detectionThresholds(configuration)
            )
            // 3段目: 「終了」または「継続」（end・update）と判定された候補だけ、店舗の継続中のイベント（投稿より前に始まり、1段目の配布物の最上位の種類と一致するもの。確率は見ず、最上位が none などで種類が決まらなければ聞かない）から連携先を提案する（自動では連携しない）。
            // 旧単一ジョブの仮の名前は配布物の名前として渡さない。失敗しても判定は続け、提案なしにする。
            const linkedEvent = isLinkedEventAction(recorded.action)
              ? await inWebhookStage('linked_event', () =>
                  proposeWebhookLinkedEvent(env, run, {
                    storeKey,
                    screenName: job.post.screenName,
                    item: legacy ? null : item,
                    postedAt: job.post.createdAt,
                    beforeSend: (sent) =>
                      inWebhookStage('prompt_save', () =>
                        saveWebhookPromptAttempt(env, target, token, DETECTION_VERSION, sent)
                      )
                  })
                )
              : null
            const discovery = linkedEvent === null ? recorded : { ...recorded, linkedEvent }
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
      (discoveryRecorded || isLegacyWebhookRegisterRetry(job.post, stored.resultJson)) &&
      canAutoRegisterWebhookCandidate(
        job.post,
        result,
        candidate,
        judged.discovery === undefined ? null : judged.discovery
      )
    const baseReasons = [
      ...result.reasons,
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
        ? await inWebhookStage('title', () =>
            generateEventTitle(
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
      await inWebhookStage('registration', async () =>
        registerWebhookEvent(env, await currentJob(), validateWebhookEvent(registered, job.eventUUID), token, target)
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
    const finalJob = await inWebhookStage('discovery', async () =>
      synchronizeWebhookDiscovery(env, await currentJob(), target, token)
    )
    await inWebhookStage('notification', () => notifyWebhookJob(env, finalJob, token, target))
    return null
  } catch (error) {
    if (error instanceof NotificationRetry) return error.delay
    // どの区切りにも入らない失敗は candidate。親ジョブ側（webhook-job-process.ts）も同じ例外から同じコードを作る。
    markWebhookStage(error, 'candidate')
    await env.DB.prepare(`UPDATE ${target.table} SET status=CASE WHEN status='processing' THEN 'failed' ELSE status END,
      last_error=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`)
      .bind(webhookProcessingErrorCode(error), dayjs().valueOf(), target.id, token)
      .run()
    throw error
  }
}
