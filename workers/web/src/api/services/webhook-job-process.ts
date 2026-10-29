import { detectionConfiguration } from '@api/services/webhook-config'
import { extractWebhookEvents, webhookProcessingErrorCode } from '@api/services/webhook-extraction'
import { inWebhookStage, markWebhookStage } from '@api/services/webhook-failure-stage'
import {
  claimWebhookJob,
  getWebhookJob,
  refreshWebhookJob,
  releaseWebhookJob,
  storedJson,
  webhookTarget
} from '@api/services/webhook-jobs'
import { saveWebhookPromptAttempt } from '@api/services/webhook-prompt'
import type { Bindings } from '@api/types/bindings'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import {
  auditItemCount,
  createItemCountRequest,
  EventExtractionSchema,
  EXTRACTION_VERSION,
  ItemCountAuditSchema,
  matchExtractionCandidateInput,
  validateEventExtraction
} from '@biccame/shared/event-detect/extraction'
import dayjs from 'dayjs'
import { processWebhookCandidate } from './webhook-candidate-process'
import { persistWebhookExtractionCandidates } from './webhook-extraction-candidates'
import { detectionDeadline, LEGACY_ITEM, type ProcessOptions } from './webhook-processing-context'

// 再監査や参考文脈の更新を、新しくLLM抽出した履歴と偽らない。
const sourceExtractionVersion = (value: unknown): string =>
  typeof value === 'object' &&
  value !== null &&
  'version' in value &&
  typeof value.version === 'string' &&
  value.version.length > 0
    ? value.version
    : 'legacy-unversioned'

/** リースを取れなかったとき、キューに再試行までの秒数として返す値。待つ必要が無ければ null。 */
const leaseRetryDelay = async (env: Bindings, postId: string): Promise<number | null> => {
  const job = await getWebhookJob(env, postId)
  const waiting = ['queued', 'processing', 'failed'].includes(job.status) || job.notificationStatus === 'pending'
  if (!waiting) return null
  const lease = await env.DB.prepare('SELECT lease_until FROM webhook_event_jobs WHERE post_id=?')
    .bind(postId)
    .first<number>('lease_until')
  return lease === null ? 30 : Math.max(1, Math.ceil((lease - dayjs().valueOf()) / 1000) + 1)
}

export const processWebhookJob = async (
  env: Bindings,
  postId: string,
  options: ProcessOptions = {}
): Promise<number | null> => {
  // リースを取る前の失敗は last_error に書けない（書く先のリースが無い）ので、キューのログにだけ claim として出る。
  const token = await inWebhookStage('claim', () => claimWebhookJob(env, postId))
  if (token === null) return await inWebhookStage('claim', () => leaseRetryDelay(env, postId))
  try {
    const job = await getWebhookJob(env, postId)
    const stored = await env.DB.prepare('SELECT extraction_json,result_json FROM webhook_event_jobs WHERE post_id=?')
      .bind(postId)
      .first<{ extraction_json: string | null; result_json: string | null }>()
    if (!stored) throw new Error('Webhook job disappeared')
    if (stored.extraction_json === null && job.candidates.length === 0) {
      // 移行後に旧形式の判定が保存された場合も、成功済みイベントを作り直さない。
      if (stored.result_json !== null || job.eventId !== null) {
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO webhook_event_candidates (event_uuid,post_id,item,post_json,source_url,status,reasons_json,result_json,candidate_json,answers_json,requests_json,model,question_version,confidence,judged_at,event_id,semantic_key,attempts,notification_status,notification_id,notification_error,notification_attempts,last_error,created_at,updated_at)
            SELECT event_uuid,post_id,?,post_json,source_url,status,reasons_json,result_json,candidate_json,answers_json,requests_json,model,question_version,confidence,judged_at,event_id,semantic_key,attempts,notification_status,notification_id,notification_error,notification_attempts,last_error,created_at,updated_at FROM webhook_event_jobs WHERE post_id=? AND lease_token=?`).bind(
            job.candidate?.title ? job.candidate.title : LEGACY_ITEM,
            postId,
            token
          ),
          env.DB.prepare(
            `UPDATE webhook_event_jobs SET extraction_json='{"version":"legacy-single"}' WHERE post_id=? AND lease_token=?`
          ).bind(postId, token)
        ])
      } else {
        const configuration = await detectionConfiguration(env)
        const countResponse = await inWebhookStage('item_count', async () => {
          const countRequest = createItemCountRequest(job.post, configuration.model)
          await inWebhookStage('prompt_save', () =>
            saveWebhookPromptAttempt(env, webhookTarget(postId), token, EXTRACTION_VERSION, [countRequest])
          )
          const countRaw: unknown = await detectionDeadline(
            env.AI.run(`@cf/cloudflare/${configuration.model}`, countRequest)
          )
          const parsed = ClefResponseSchema.safeParse(countRaw)
          if (!parsed.success) throw new Error('Invalid item count response')
          return parsed.data
        })
        // 抽出系の失敗は固有コード（extraction_*）のまま残る。それ以外の例外だけが extraction 段階になる。
        const extract = () =>
          inWebhookStage('extraction', async () =>
            validateEventExtraction(
              job.post,
              options.extractor === undefined
                ? await extractWebhookEvents(env, job.post, options.extractionFetcher)
                : await options.extractor(job.post)
            )
          )
        const first = await extract()
        const firstAudit = auditItemCount(first.events, countResponse, configuration.itemCountThreshold)
        // 件数不一致による再抽出は1回だけ。各抽出のツール未呼び出し再試行を含め最大4通信。
        const extraction = firstAudit.status === 'mismatch' ? await extract() : first
        const itemCountAudit = auditItemCount(extraction.events, countResponse, configuration.itemCountThreshold)
        await inWebhookStage('extraction_save', () =>
          persistWebhookExtractionCandidates(env, job, token, extraction, itemCountAudit)
        )
      }
    }
    const initialCandidates = (await getWebhookJob(env, postId)).candidates
    // 旧監査で候補作成前に停止した履歴も、保存根拠を保って確認対象へ戻す。
    if (stored.extraction_json !== null && initialCandidates.length === 0) {
      const envelope = storedJson(stored.extraction_json)
      const parsed = EventExtractionSchema.safeParse(envelope)
      const audit = ItemCountAuditSchema.safeParse(
        typeof envelope === 'object' && envelope !== null && 'itemCountAudit' in envelope
          ? envelope.itemCountAudit
          : undefined
      )
      if (!parsed.success || !audit.success) throw new Error('Invalid saved extraction review')
      const extraction = validateEventExtraction(job.post, parsed.data)
      await inWebhookStage('extraction_save', () =>
        persistWebhookExtractionCandidates(env, job, token, extraction, audit.data, sourceExtractionVersion(envelope))
      )
    }
    const candidates = (await getWebhookJob(env, postId)).candidates
    // 旧単一ジョブの移行の印（この実行で移行した場合を含む）。候補の名前の値では判定しない（旧形式の題が入ることがある）。
    const legacy =
      (await env.DB.prepare(
        `SELECT 1 AS legacy FROM webhook_event_jobs WHERE post_id=? AND json_valid(extraction_json) AND json_extract(extraction_json,'$.version')='legacy-single'`
      )
        .bind(postId)
        .first()) !== null
    // 旧候補は明示的な再判定時だけ件数を監査し、登録済みUUIDや配布内容は変えない。
    if (candidates.some((candidate) => candidate.status === 'queued') && stored.extraction_json !== null) {
      const envelope = storedJson(stored.extraction_json)
      const storedExtraction = EventExtractionSchema.safeParse(envelope)
      if (!storedExtraction.success) throw new Error('Invalid stored event extraction')
      const savedExtraction = validateEventExtraction(job.post, storedExtraction.data)
      const configuration = await detectionConfiguration(env)
      const response = await inWebhookStage('item_count', async () => {
        const request = createItemCountRequest(job.post, configuration.model)
        await inWebhookStage('prompt_save', () =>
          saveWebhookPromptAttempt(env, webhookTarget(postId), token, EXTRACTION_VERSION, [request])
        )
        const raw: unknown = await detectionDeadline(env.AI.run(`@cf/cloudflare/${configuration.model}`, request))
        const parsed = ClefResponseSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid item count response')
        return parsed.data
      })
      const audit = auditItemCount(savedExtraction.events, response, configuration.itemCountThreshold)
      await env.DB.prepare('UPDATE webhook_event_jobs SET extraction_json=? WHERE post_id=? AND lease_token=?')
        .bind(
          JSON.stringify({
            ...savedExtraction,
            version: sourceExtractionVersion(envelope),
            contextVersion: EXTRACTION_VERSION,
            itemCountAudit: audit
          }),
          postId,
          token
        )
        .run()
      // 明示的な再判定では、同一物品（item と店舗の組）を一意に照合できる候補だけ参考文脈を復元する。
      // 複数店舗の抽出イベントは店舗ごとの候補になるので、同じ item の候補を店舗で区別する。
      for (const candidate of candidates.filter((value) => value.status === 'queued')) {
        const input = matchExtractionCandidateInput(job.post, savedExtraction, candidate.item, candidate.storeKey)
        if (input === undefined) continue
        await env.DB.prepare(
          `UPDATE webhook_event_candidates SET post_json=? WHERE event_uuid=? AND post_id=? AND status='queued'
          AND EXISTS (SELECT 1 FROM webhook_event_jobs WHERE post_id=? AND lease_token=?)`
        )
          .bind(JSON.stringify(input.post), candidate.eventUUID, postId, postId, token)
          .run()
      }
    }
    const delays: number[] = []
    const failures: unknown[] = []
    for (const candidate of candidates) {
      if (!['queued', 'processing', 'failed'].includes(candidate.status) && candidate.notificationStatus !== 'pending')
        continue
      const now = dayjs().valueOf()
      const renewed = await env.DB.prepare(
        'UPDATE webhook_event_jobs SET lease_until=? WHERE post_id=? AND lease_token=?'
      )
        .bind(now + 300_000, postId, token)
        .run()
      if (renewed.meta.changes !== 1) throw new Error('Webhook processing lease lost')
      const claimed =
        await env.DB.prepare(`UPDATE webhook_event_candidates SET lease_token=?,lease_until=?,attempts=attempts+1,last_error=NULL,
        status=CASE WHEN status IN ('queued','failed') THEN 'processing' ELSE status END
        WHERE event_uuid=? AND (lease_until IS NULL OR lease_until<?)`)
          .bind(token, now + 300_000, candidate.eventUUID, now)
          .run()
      if (claimed.meta.changes !== 1) {
        delays.push(30)
        continue
      }
      try {
        const delay = await processWebhookCandidate(
          env,
          postId,
          token,
          options,
          webhookTarget(postId, candidate.eventUUID),
          candidate.item,
          candidate.storeKey,
          legacy
        )
        if (delay !== null) delays.push(delay)
      } catch (error) {
        failures.push(error)
      } finally {
        await env.DB.prepare(
          'UPDATE webhook_event_candidates SET lease_token=NULL,lease_until=NULL WHERE event_uuid=? AND lease_token=?'
        )
          .bind(candidate.eventUUID, token)
          .run()
      }
    }
    await inWebhookStage('aggregate', () => refreshWebhookJob(env, postId, token))
    if (failures.length > 0) throw failures[0]
    return delays.length > 0 ? Math.max(...delays) : null
  } catch (error) {
    // 段階が付いていない失敗（保存済みの抽出の読み取りなど）は job。候補の失敗は候補側（webhook-candidate-process.ts）が段階を付けている。
    markWebhookStage(error, 'job')
    await env.DB.prepare(
      `UPDATE webhook_event_jobs SET status=CASE WHEN status='processing' THEN 'failed' ELSE status END,last_error=?,updated_at=? WHERE post_id=? AND lease_token=?`
    )
      .bind(webhookProcessingErrorCode(error), dayjs().valueOf(), postId, token)
      .run()
    throw error
  } finally {
    await releaseWebhookJob(env, postId, token)
  }
}
