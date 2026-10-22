import {
  claimWebhookJob,
  getWebhookJob,
  insertWebhookJob,
  registerWebhookEvent,
  validateWebhookEvent
} from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { migrationSql, uuid } from './social-event-selection-db'

/** 生SQLの保存経路が書く Prisma の DateTime 列。 */
export const DATETIME_COLUMNS = {
  events: ['start_date', 'end_date', 'ended_at', 'clef_judged_at', 'created_at', 'updated_at'],
  event_conditions: ['created_at', 'updated_at'],
  event_reference_urls: ['created_at', 'updated_at'],
  event_stores: ['created_at', 'updated_at']
} as const
export const request = (id: number, input: Partial<EventRequest> & Pick<EventRequest, 'startDate'>): EventRequest => ({
  uuid: uuid(id),
  category: 'limited_card',
  title: `テストイベント${id}`,
  isVerified: true,
  isPreliminary: false,
  shouldTweet: true,
  conditions: [{ uuid: crypto.randomUUID(), type: 'everyone' }],
  referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: `https://example.com/events/${id}` }],
  stores: ['akiba'],
  characterIds: ['akiba'],
  ...input
})
export const withPosting = (env: Bindings) =>
  Object.assign(env, { ENVIRONMENT: 'local', X_POSTING_ENABLED: 'true', DISCORD_POSTING_ENABLED: 'true' })
/** 受信→lease取得→判定→登録の実経路で Webhook 由来のイベントを登録し、そのUUIDを返す。 */
export const registerFromWebhook = async (env: Bindings, id: number, dates: { startDate: string; endDate: string }) => {
  const postId = `21092217217735760${String(id).padStart(2, '0')}`
  const sourceUrl = `https://x.com/bic_akiba/status/${postId}`
  await insertWebhookJob(env, {
    id: postId,
    createdAt: '2026-10-11T00:00:00Z',
    screenName: 'bic_akiba',
    kind: 'original',
    text: `本日より限定名刺を配布 ${id}`,
    url: sourceUrl,
    media: []
  })
  const token = await claimWebhookJob(env, postId)
  if (token === null) throw new Error('Webhook job was not claimed')
  // webhook-process と同じくジョブ側の判定時刻はミリ秒で書き、イベント側 clef_judged_at への変換も通す。
  await env.DB.prepare(
    'UPDATE webhook_event_jobs SET judged_at=?,confidence=0.99,model=?,question_version=? WHERE post_id=?'
  )
    .bind(dayjs('2026-10-11T00:00:00.456Z').valueOf(), 'clef', 'test-v1', postId)
    .run()
  const job = await getWebhookJob(env, postId)
  const event = validateWebhookEvent(
    {
      ...request(id, dates),
      uuid: job.eventUUID,
      referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: sourceUrl }]
    },
    job.eventUUID
  )
  await registerWebhookEvent(env, job, event, token)
  return job.eventUUID
}
/** Prisma の D1 アダプタの形式（例: 2026-10-12T00:00:00.123+00:00）ではない DateTime 列の値を集める。 */
const CANONICAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+00:00$/
export const nonCanonicalDateTimes = async (env: Bindings) => {
  const found: { table: string; column: string; value: unknown }[] = []
  for (const [table, columns] of Object.entries(DATETIME_COLUMNS)) {
    for (const column of columns) {
      // D1 は LIKE / GLOB のパターン長に上限があるので、形式の判定は取得後に行う。
      const rows = await env.DB.prepare(
        `SELECT typeof(${column}) AS type, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`
      ).all<{ type: string; value: unknown }>()
      found.push(
        ...rows.results
          .filter((row) => row.type !== 'text' || !CANONICAL_PATTERN.test(String(row.value)))
          .map((row) => ({ table, column, value: row.value }))
      )
    }
  }
  return found
}
/** 本番と同じ順に、日時を揃えるデータ移行を流す。 */
const NORMALIZE_MIGRATIONS = [
  '20261012090000_normalize_event_datetimes',
  '20261012091000_normalize_event_datetime_text'
]
export const normalize = async (env: Bindings) => {
  for (const name of NORMALIZE_MIGRATIONS) await env.DB.exec(await migrationSql(name))
}
export const snapshot = async (env: Bindings) =>
  Promise.all(
    Object.keys(DATETIME_COLUMNS).map(
      async (table) => (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results
    )
  )
