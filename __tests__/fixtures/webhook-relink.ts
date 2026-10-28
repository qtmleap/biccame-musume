import type { Bindings } from '@api/types/bindings'
import { event, type RejudgeSeed, SEED_UPDATED_AT } from './webhook-d1-jobs'

// 手動で連携した登録済みジョブ。resolveWebhookJob の link が書く reasons と同じ。
export const linkedSeed: RejudgeSeed = {
  status: 'registered',
  notificationStatus: 'sent',
  leaseUntil: null,
  reasons: ['manually_linked']
}

// パイプラインが自動登録したジョブ。manually_linked を持たない。
export const autoRegisteredSeed: RejudgeSeed = { ...linkedSeed, reasons: ['title_generated'] }

/** 連携先になるイベントを最小の列で作る。 */
export const insertEvent = async (env: Bindings, id: string, title: string) => {
  await env.DB.prepare(
    "INSERT INTO events (id,category,title,start_date,updated_at) VALUES (?,'other',?,'2026-11-07T00:00:00+09:00','2026-10-20T00:00:00Z')"
  )
    .bind(id, title)
    .run()
}

export const insertAnnounce = async (env: Bindings, eventId: string, url: string) => {
  await env.DB.prepare(
    "INSERT INTO event_reference_urls (id,event_id,type,url,created_at,updated_at) VALUES (?,?,'announce',?,'2026-10-20T00:00:00Z','2026-10-20T00:00:00Z')"
  )
    .bind(crypto.randomUUID(), eventId, url)
    .run()
}

/** イベント本体と参照URLをまとめて JSON にする。連携し直しの前後で一致することを確かめる。 */
export const eventSnapshot = async (env: Bindings, id: string) => {
  const row = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(id).first()
  const references = await env.DB.prepare('SELECT * FROM event_reference_urls WHERE event_id=? ORDER BY id')
    .bind(id)
    .all()
  return JSON.stringify({ row, references: references.results })
}

export const announceUrls = async (env: Bindings, eventId: string) =>
  (
    await env.DB.prepare("SELECT url FROM event_reference_urls WHERE event_id=? AND type='announce' ORDER BY url")
      .bind(eventId)
      .all<{ url: string }>()
  ).results.map((row) => row.url)

export type CandidateSeed = {
  uuid: string
  status: string
  reasons: string[]
  eventId: string | null
  notificationStatus: string
  /** 並び順（created_at, event_uuid）を決める。 */
  createdAt: number
  /** 最後の更新（updated_at、ms）。省略すると古い固定値（止まっていると見なされる側）。 */
  updatedAt?: number
  /** リースの期限（lease_until、ms）。省略するとリースなし。 */
  leaseUntil?: number
  /** 処理の回数（attempts）。省略すると 3。 */
  attempts?: number
}

/** 判定結果・回答・エラーを埋めた候補を、既存の親ジョブの下に作る。 */
export const seedCandidate = async (env: Bindings, postId: string, seed: CandidateSeed) => {
  await env.DB.prepare(`INSERT INTO webhook_event_candidates
    (event_uuid,post_id,item,post_json,source_url,status,reasons_json,result_json,candidate_json,answers_json,
    model,question_version,confidence,judged_at,event_id,semantic_key,attempts,notification_status,notification_id,
    notification_error,notification_attempts,last_error,created_at,updated_at,lease_token,lease_until)
    SELECT ?,post_id,'限定名刺',post_json,source_url,?,?,?,?,?,'clef-flash','old-v1',0.72,1791676800000,?,?,?,?,
    'message-1','previous notification error',2,'previous processing error',?,?,?,?
    FROM webhook_event_jobs WHERE post_id=?`)
    .bind(
      seed.uuid,
      seed.status,
      JSON.stringify(seed.reasons),
      '{"answers":{"is_event":{"type":"noul","noul":0.72}}}',
      JSON.stringify({ ...event, uuid: seed.uuid }),
      '{"is_event":{"type":"noul","noul":0.72}}',
      seed.eventId,
      `semantic-${seed.uuid}`,
      seed.attempts === undefined ? 3 : seed.attempts,
      seed.notificationStatus,
      seed.createdAt,
      seed.updatedAt === undefined ? SEED_UPDATED_AT : seed.updatedAt,
      seed.leaseUntil === undefined ? null : 'other-worker',
      seed.leaseUntil === undefined ? null : seed.leaseUntil,
      postId
    )
    .run()
}

export const candidateRow = (env: Bindings, uuid: string) =>
  env.DB.prepare('SELECT * FROM webhook_event_candidates WHERE event_uuid=?').bind(uuid).first()
