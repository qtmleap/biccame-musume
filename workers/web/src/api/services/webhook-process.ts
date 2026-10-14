import { notifyEventDetection } from '@api/services/discord'
import { getEvent } from '@api/services/event-service'
import { exhaustSocialJob, processSocialJob } from '@api/services/social-posting'
import { detectionConfiguration } from '@api/services/webhook-config'
import { extractWebhookEvents, webhookProcessingErrorCode } from '@api/services/webhook-extraction'
import {
  claimWebhookJob,
  duplicateWebhookEvents,
  getWebhookCandidate,
  getWebhookJob,
  refreshWebhookJob,
  registerWebhookEvent,
  releaseWebhookJob,
  storedJson,
  validateWebhookEvent,
  type WebhookTarget,
  webhookConditionIdentity,
  webhookItemIdentity,
  webhookTarget
} from '@api/services/webhook-jobs'
import { generateEventTitle, type TitleFetcher } from '@api/services/webhook-title'
import type { Bindings } from '@api/types/bindings'
import { discordDeliveryResultSchema, type EventDetectionNotification } from '@biccame/shared/bot'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import {
  createDetectionRequest,
  DETECTION_VERSION,
  type DetectionCandidate,
  DetectionResultSchema,
  evaluateDetection
} from '@biccame/shared/event-detect/detection'
import {
  auditItemCount,
  createItemCountRequest,
  EXTRACTION_VERSION,
  extractedPost,
  ItemCountAuditSchema,
  validateEventExtraction
} from '@biccame/shared/event-detect/extraction'
import { EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import { type WebhookJob, WebhookQueueMessageSchema } from '@biccame/shared/schemas/webhook.dto'
import { SocialQueueMessageSchema } from '@biccame/shared/social'
import { botStores } from '@biccame/shared/stores'
import dayjs from 'dayjs'

const siteOrigin = (env: Bindings) =>
  env.ENVIRONMENT === 'prod'
    ? 'https://biccame-musume.com'
    : env.ENVIRONMENT === 'dev'
      ? 'https://dev.biccame-musume.com'
      : 'http://localhost:15175'
const eventCandidate = (candidate: DetectionCandidate, uuid: string) => {
  const value = {
    ...candidate,
    uuid,
    startDate: `${candidate.startDate}T00:00:00+09:00`,
    ...(candidate.endDate ? { endDate: `${candidate.endDate}T23:59:59+09:00` } : {}),
    conditions: candidate.conditions.map((condition) => ({ ...condition, uuid: crypto.randomUUID() })),
    referenceUrls: candidate.referenceUrls.map((reference) => ({ ...reference, uuid: crypto.randomUUID() })),
    isVerified: true,
    shouldTweet: false
  }
  const parsed = EventRequestSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** 旧単一ジョブの移行で、登録候補の題が無いときに候補へ入れる仮の名前 */
const LEGACY_ITEM = '既存配布物'

const detectionDeadline = async <T>(task: Promise<T>): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('Detection timed out')), { once: true })
  })
  try {
    return await Promise.race([task, deadline])
  } finally {
    clearTimeout(timer)
  }
}

class NotificationRetry extends Error {
  readonly delay: number
  constructor(delay: number) {
    super('Notification retry required')
    this.delay = delay
  }
}

export const notifyWebhookJob = async (
  env: Bindings,
  job: WebhookJob,
  token: string,
  target: WebhookTarget = webhookTarget(job.postId)
): Promise<void> => {
  if ((job.status !== 'held' && job.status !== 'registered') || job.notificationStatus !== 'pending') return
  const candidate = job.candidate
  const eventId = job.eventId
  const registered = job.status === 'registered' && eventId !== null ? await getEvent(env, eventId) : null
  const siblings = target.table === 'webhook_event_candidates' ? (await getWebhookJob(env, job.postId)).candidates : []
  const position = siblings.findIndex((value) => value.eventUUID === job.eventUUID)
  const sibling = siblings[position]
  const common = {
    ...(sibling === undefined
      ? {}
      : { candidate: { id: job.eventUUID, item: sibling.item, index: position + 1, total: siblings.length } }),
    requestId: job.eventUUID,
    postId: job.postId,
    postUrl: job.sourceUrl,
    managementUrl: `${siteOrigin(env)}/admin/webhooks/${job.postId}`,
    text: job.post.text,
    confidence: job.confidence === null ? 0 : job.confidence,
    reasons: job.reasons.slice(0, 20).map((reason) => reason.slice(0, 500)),
    stores: (registered
      ? registered.stores
      : candidate
        ? candidate.stores
        : botStores
            .filter((store) => store.twitter_id.toLowerCase() === job.post.screenName.toLowerCase())
            .map((store) => store.id)
    )
      .slice(0, 20)
      .map((id) => {
        const store = botStores.find((value) => value.id === id)
        return store ? store.name : id
      })
  }
  const input: EventDetectionNotification =
    registered !== null && eventId !== null
      ? {
          ...common,
          status: 'registered',
          event: {
            title: registered.title.slice(0, 300),
            url: `${siteOrigin(env)}/events/${eventId}`,
            category: registered.category,
            startDate: dayjs(registered.startDate).toISOString(),
            ...(registered.endDate ? { endDate: dayjs(registered.endDate).toISOString() } : {}),
            conditions: registered.conditions.map(
              (condition) =>
                `${condition.type}${condition.purchaseAmount === undefined ? '' : ` ${condition.purchaseAmount}円`}${condition.quantity === undefined ? '' : ` ${condition.quantity}名`}`
            )
          }
        }
      : { ...common, status: 'held' }
  // 送信開始を先に記録する。結果保存前に停止した場合の盲目的再送を防ぐ。
  const started = await env.DB.prepare(`UPDATE ${target.table} SET notification_status='unknown',
    notification_error='delivery_in_progress',notification_attempts=notification_attempts+1,updated_at=?
    WHERE ${target.column}=? AND lease_token=? AND notification_status='pending'`)
    .bind(dayjs().valueOf(), target.id, token)
    .run()
  if (started.meta.changes !== 1) return
  try {
    const raw = await notifyEventDetection(env, input)
    const parsed = discordDeliveryResultSchema.safeParse(raw)
    if (!parsed.success) throw new Error('Invalid Discord RPC response')
    const result = parsed.data
    const retryDelay =
      result.status === 'failed' && result.kind === 'rate_limit' && result.retryAfterSeconds !== undefined
        ? Math.ceil(result.retryAfterSeconds)
        : null
    const status =
      result.status === 'sent'
        ? 'sent'
        : result.status === 'unknown'
          ? 'unknown'
          : retryDelay !== null
            ? 'pending'
            : 'failed'
    const error = result.status === 'sent' ? null : result.kind
    await env.DB.prepare(
      `UPDATE ${target.table} SET notification_status=?,notification_id=?,notification_error=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`
    )
      .bind(status, result.status === 'sent' ? result.messageId : null, error, dayjs().valueOf(), target.id, token)
      .run()
    if (retryDelay !== null) throw new NotificationRetry(retryDelay)
  } catch (error) {
    if (error instanceof NotificationRetry) throw error
    await env.DB.prepare(
      `UPDATE ${target.table} SET notification_status='unknown',notification_error='delivery_unknown',updated_at=? WHERE ${target.column}=? AND lease_token=?`
    )
      .bind(dayjs().valueOf(), target.id, token)
      .run()
  }
}

/** titleFetcher はタイトル生成の通信の差し替え口（テスト用。省略すると fetch） */
type ProcessOptions = {
  titleFetcher?: TitleFetcher
  extractionFetcher?: TitleFetcher
  extractor?: (post: WebhookJob['post']) => Promise<unknown>
}

const processWebhookCandidate = async (
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
    const result =
      stored.resultJson === null
        ? await (async () => {
            const configuration = await detectionConfiguration(env)
            const request = createDetectionRequest(job.post, configuration.model, storeKey)
            const raw: unknown = await detectionDeadline(env.AI.run(`@cf/cloudflare/${configuration.model}`, request))
            const response = ClefResponseSchema.safeParse(raw)
            if (!response.success) throw new Error('Invalid AI response')
            const decision = evaluateDetection(
              job.post,
              request,
              response.data,
              {
                eventThreshold: configuration.eventThreshold,
                fieldThreshold: configuration.choiceThreshold,
                ignoreThreshold: configuration.ignoreThreshold,
                fieldThresholds: configuration.fieldThresholds
              },
              storeKey
            )
            await env.DB.prepare(
              `UPDATE ${target.table} SET result_json=?,answers_json=?,model=?,question_version=?,confidence=?,judged_at=?,updated_at=? WHERE ${target.column}=? AND lease_token=?`
            )
              .bind(
                JSON.stringify(decision),
                JSON.stringify(response.data.answers),
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
    const baseReasons = [
      ...result.reasons,
      ...(result.status === 'register' && candidate === null ? ['invalid_event_candidate'] : []),
      ...duplicates.map((id) => `possible_duplicate:${id}`)
    ]
    const canRegister = result.status === 'register' && candidate !== null && duplicates.length === 0
    // 同じ店舗・種別・開始日の別投稿が登録済みなら保留にする。この判定とスロットの予約は、タイトルを付ける（LLM を呼ぶ）前に済ませる。
    const semantic =
      canRegister && candidate !== null
        ? JSON.stringify([
            candidate.stores.slice().sort(),
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
      candidate !== null
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
    await notifyWebhookJob(env, await currentJob(), token, target)
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

export const processWebhookJob = async (
  env: Bindings,
  postId: string,
  options: ProcessOptions = {}
): Promise<number | null> => {
  const token = await claimWebhookJob(env, postId)
  if (token === null) {
    const job = await getWebhookJob(env, postId)
    const waiting = ['queued', 'processing', 'failed'].includes(job.status) || job.notificationStatus === 'pending'
    if (!waiting) return null
    const lease = await env.DB.prepare('SELECT lease_until FROM webhook_event_jobs WHERE post_id=?')
      .bind(postId)
      .first<number>('lease_until')
    return lease === null ? 30 : Math.max(1, Math.ceil((lease - dayjs().valueOf()) / 1000) + 1)
  }
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
          env.DB.prepare(`INSERT INTO webhook_event_candidates (event_uuid,post_id,item,post_json,source_url,status,reasons_json,result_json,candidate_json,answers_json,model,question_version,confidence,judged_at,event_id,semantic_key,attempts,notification_status,notification_id,notification_error,notification_attempts,last_error,created_at,updated_at)
            SELECT event_uuid,post_id,?,post_json,source_url,status,reasons_json,result_json,candidate_json,answers_json,model,question_version,confidence,judged_at,event_id,semantic_key,attempts,notification_status,notification_id,notification_error,notification_attempts,last_error,created_at,updated_at FROM webhook_event_jobs WHERE post_id=? AND lease_token=?`).bind(
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
        const countRequest = createItemCountRequest(job.post, configuration.model)
        const countRaw: unknown = await detectionDeadline(
          env.AI.run(`@cf/cloudflare/${configuration.model}`, countRequest)
        )
        const countResponse = ClefResponseSchema.safeParse(countRaw)
        if (!countResponse.success) throw new Error('Invalid item count response')
        const extract = async () =>
          validateEventExtraction(
            job.post,
            options.extractor === undefined
              ? await extractWebhookEvents(env, job.post, options.extractionFetcher)
              : await options.extractor(job.post)
          )
        const first = await extract()
        const firstAudit = auditItemCount(first.events, countResponse.data, configuration.choiceThreshold)
        // 件数不一致による再抽出は1回だけ。各抽出のツール未呼び出し再試行を含め最大4通信。
        const extraction = firstAudit.status === 'mismatch' ? await extract() : first
        const itemCountAudit = auditItemCount(extraction.events, countResponse.data, configuration.choiceThreshold)
        const now = dayjs().valueOf()
        if (itemCountAudit.status !== 'matched') {
          await env.DB.prepare(
            "UPDATE webhook_event_jobs SET extraction_json=?,status='held',notification_status='skipped',reasons_json=?,updated_at=? WHERE post_id=? AND lease_token=?"
          )
            .bind(
              JSON.stringify({ version: EXTRACTION_VERSION, ...extraction, itemCountAudit }),
              JSON.stringify([`distribution_item_count_${itemCountAudit.status}`]),
              now,
              postId,
              token
            )
            .run()
          return null
        }
        const statements = extraction.events.map((event, index) =>
          env.DB.prepare(`INSERT INTO webhook_event_candidates
          (event_uuid,post_id,item,store_key,post_json,source_url,status,created_at,updated_at)
          SELECT ?,?,?,?,?,?, 'queued',?,? WHERE EXISTS (SELECT 1 FROM webhook_event_jobs WHERE post_id=? AND lease_token=?)`).bind(
            index === 0 ? job.eventUUID : crypto.randomUUID(),
            postId,
            event.item,
            event.store === 'none' ? null : event.store,
            JSON.stringify(extractedPost(job.post, event)),
            job.sourceUrl,
            now + index,
            now,
            postId,
            token
          )
        )
        statements.push(
          env.DB.prepare(
            `UPDATE webhook_event_jobs SET extraction_json=?,status=?,notification_status=?,reasons_json=?,updated_at=? WHERE post_id=? AND lease_token=?`
          ).bind(
            JSON.stringify({ version: EXTRACTION_VERSION, ...extraction, itemCountAudit }),
            extraction.events.length === 0 ? 'ignored' : 'processing',
            extraction.events.length === 0 ? 'skipped' : 'pending',
            JSON.stringify(extraction.events.length === 0 ? ['not_distribution_event'] : []),
            now,
            postId,
            token
          )
        )
        const saved = await env.DB.batch(statements)
        if (saved.at(-1)?.meta.changes !== 1) throw new Error('Webhook extraction lease lost')
      }
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
    if (job.status === 'queued' && candidates.length > 0 && stored.extraction_json !== null) {
      const savedExtraction = validateEventExtraction(job.post, storedJson(stored.extraction_json))
      const configuration = await detectionConfiguration(env)
      const request = createItemCountRequest(job.post, configuration.model)
      const raw: unknown = await detectionDeadline(env.AI.run(`@cf/cloudflare/${configuration.model}`, request))
      const response = ClefResponseSchema.safeParse(raw)
      if (!response.success) throw new Error('Invalid item count response')
      const audit = auditItemCount(savedExtraction.events, response.data, configuration.choiceThreshold)
      await env.DB.prepare('UPDATE webhook_event_jobs SET extraction_json=? WHERE post_id=? AND lease_token=?')
        .bind(JSON.stringify({ ...savedExtraction, version: EXTRACTION_VERSION, itemCountAudit: audit }), postId, token)
        .run()
      if (audit.status !== 'matched') {
        await env.DB.prepare(
          "UPDATE webhook_event_jobs SET status='held',reasons_json=? WHERE post_id=? AND lease_token=?"
        )
          .bind(JSON.stringify([`distribution_item_count_${audit.status}`]), postId, token)
          .run()
        await env.DB.prepare(
          "UPDATE webhook_event_candidates SET status='held',reasons_json=? WHERE post_id=? AND status='queued'"
        )
          .bind(JSON.stringify([`distribution_item_count_${audit.status}`]), postId)
          .run()
        return null
      }
    }
    if (stored.extraction_json !== null && candidates.length === 0) {
      const envelope = storedJson(stored.extraction_json)
      const audit = ItemCountAuditSchema.safeParse(
        typeof envelope === 'object' && envelope !== null && 'itemCountAudit' in envelope
          ? envelope.itemCountAudit
          : undefined
      )
      if (audit.success && audit.data.status !== 'matched') return null
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
    await refreshWebhookJob(env, postId, token)
    if (failures.length > 0) throw failures[0]
    return delays.length > 0 ? Math.max(...delays) : null
  } catch (error) {
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

export const handleWebhookQueue = async (batch: MessageBatch<unknown>, env: Bindings) => {
  for (const message of batch.messages) {
    const social = SocialQueueMessageSchema.safeParse(message.body)
    if (social.success) {
      try {
        if (batch.queue.endsWith('-dlq')) {
          await exhaustSocialJob(env, social.data.jobId)
          message.ack()
          continue
        }
        const delay = await processSocialJob(env, social.data.jobId)
        if (delay === null) message.ack()
        else message.retry({ delaySeconds: delay })
      } catch {
        console.error('[social-queue] processing failed')
        message.retry({ delaySeconds: 60 })
      }
      continue
    }

    const parsed = WebhookQueueMessageSchema.safeParse(message.body)
    if (!parsed.success) {
      message.ack()
      continue
    }
    try {
      if (batch.queue.endsWith('-dlq')) {
        await env.DB.batch(
          ['webhook_event_candidates', 'webhook_event_jobs'].map((table) =>
            env.DB.prepare(`UPDATE ${table} SET status=CASE WHEN status IN ('queued','processing','failed') THEN 'failed' ELSE status END,
          notification_status=CASE WHEN status IN ('held','registered') AND notification_status='pending' THEN 'failed' ELSE notification_status END,
          last_error='retry_exhausted',lease_token=NULL,lease_until=NULL,updated_at=? WHERE post_id=?`).bind(
              dayjs().valueOf(),
              parsed.data.postId
            )
          )
        )
        message.ack()
        continue
      }
      const delay = await processWebhookJob(env, parsed.data.postId)
      if (delay === null) message.ack()
      else message.retry({ delaySeconds: Math.min(delay, 43200) })
    } catch (error) {
      console.error(`[webhook-queue] processing failed: ${webhookProcessingErrorCode(error)}`)
      message.retry({ delaySeconds: Math.min(30 * 2 ** Math.min(message.attempts, 6), 1800) })
    }
  }
}
