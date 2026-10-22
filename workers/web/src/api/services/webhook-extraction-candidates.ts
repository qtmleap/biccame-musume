import type { Bindings } from '@api/types/bindings'
import {
  type EventExtraction,
  EXTRACTION_VERSION,
  extractionCandidateInputs,
  extractionInputStoreKey,
  type ItemCountAudit,
  itemCountReviewReasons
} from '@biccame/shared/event-detect/extraction'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'

/** 候補を監査結果と一緒に保存し、確認が必要な監査でも後段の発見判定へ渡す。複数店舗の抽出イベントは店舗ごとの候補（store_key はその店舗）に展開して保存する。抽出の保存形式（extraction_json）は展開しない。 */
export const persistWebhookExtractionCandidates = async (
  env: Pick<Bindings, 'DB'>,
  job: WebhookJob,
  token: string,
  extraction: EventExtraction,
  audit: ItemCountAudit,
  sourceVersion: string = EXTRACTION_VERSION
) => {
  const now = dayjs().valueOf()
  const inputs = extractionCandidateInputs(job.post, extraction)
  const statements = inputs.map((event, index) =>
    env.DB.prepare(`INSERT INTO webhook_event_candidates
      (event_uuid,post_id,item,store_key,post_json,source_url,status,created_at,updated_at)
      SELECT ?,?,?,?,?,?,'queued',?,? WHERE EXISTS
      (SELECT 1 FROM webhook_event_jobs WHERE post_id=? AND lease_token=?)`).bind(
      index === 0 ? job.eventUUID : crypto.randomUUID(),
      job.postId,
      event.item,
      extractionInputStoreKey(event),
      JSON.stringify(event.post),
      job.sourceUrl,
      now + index,
      now,
      job.postId,
      token
    )
  )
  statements.push(
    env.DB.prepare(
      `UPDATE webhook_event_jobs SET extraction_json=?,status='processing',notification_status='pending',
      reasons_json=?,updated_at=? WHERE post_id=? AND lease_token=?`
    ).bind(
      JSON.stringify({
        version: sourceVersion,
        contextVersion: EXTRACTION_VERSION,
        ...extraction,
        itemCountAudit: audit
      }),
      JSON.stringify(itemCountReviewReasons(audit)),
      now,
      job.postId,
      token
    )
  )
  const saved = await env.DB.batch(statements)
  if (saved.at(-1)?.meta.changes !== 1) throw new Error('Webhook extraction lease lost')
}
