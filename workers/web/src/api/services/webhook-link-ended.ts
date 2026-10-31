import { eventSocialSnapshot } from '@api/services/bot-announcement'
import { readAtomicManualEvent } from '@api/services/event-service-atomic'
import { socialInsertStatements } from '@api/services/social-posting'
import type { WebhookTarget } from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { calculateEventStatus } from '@biccame/shared/domain/event-status'
import { EventDetailSchema } from '@biccame/shared/schemas/event.dto'
import type { WebhookJob } from '@biccame/shared/schemas/webhook.dto'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

dayjs.extend(utc)
dayjs.extend(timezone)

const RawEventSchema = z.object({
  updated_at: z.union([z.number(), z.string().nonempty()]),
  ended_at: z.union([z.number(), z.string().nonempty()]).nullable(),
  start_date: z.coerce.date()
})

type SqlGuard = { sql: string; values: (string | number)[] }

/** 終了判定の投稿を既存イベントへ連携するときに、ジョブ行の更新と同じ D1 batch へ足す内容。 */
export type EndedLinkPlan = {
  /** ジョブ行の更新より前に流す文。end 参照URLの追加（または announce からの昇格）と、書くときは ended_at の更新と投稿の予約。 */
  statements: D1PreparedStatement[]
  /** ジョブ行の更新に足す条件。ended_at を書くときは、その更新が効いていることを要求し、効かなければ batch 全体を空振りにする。 */
  guard: SqlGuard
  /** ended_at を書く計画か。true のときだけ batch 成功後に投稿の回収を試みる。 */
  writesEndedAt: boolean
  /** batch が空振りした理由。リースが残っていれば、読み取りの後にイベントが変わったことになる。 */
  conflict: () => Promise<HTTPException>
}

/**
 * 終了判定の投稿を既存イベントへ手動で連携するときの、イベント側の変更を組み立てる（読み取りだけで、書き込みは呼び出し側の batch）。
 * 終了投稿の URL（job.sourceUrl）は type='end' の参照URLにする。同じ URL が連携先に無ければ end で追加し、
 * 旧コードの連携が announce で入れた行なら新しい行は足さずその type を end に直す。start / end の既存行は変えない。
 * 連携先に ended_at が無く、終了投稿の日にち（日本時間）が開始日より前でないときだけ、ended_at を投稿日の日本時間 0 時で書き、updated_at を進め、
 * 管理画面のイベント編集（shouldTweet 付き）と同じ updated 投稿を social_post_jobs へ予約する。ended_at が既にあれば上書きしない。
 * ended_at の形式は管理画面のフォーム（日付だけを日本時間 0 時の瞬間として保存）に合わせる。
 * 読み取り後に連携先が変わった場合（updated_at の CAS 失敗）や、リースを失った場合は、参照URLも含めて何も反映されない。
 */
export const planEndedLink = async (
  env: Bindings,
  input: { job: WebhookJob; eventId: string; target: WebhookTarget; token: string; now: number }
): Promise<EndedLinkPlan> => {
  const { job, eventId, target, token, now } = input
  // 版は書き込みの CAS に使う値そのものを先に読む。詳細は書くと決めたときだけ後で読み、間に更新が入っても CAS が失敗するだけにする。
  const raw = RawEventSchema.safeParse(
    await env.DB.prepare('SELECT updated_at,ended_at,start_date FROM events WHERE id=?').bind(eventId).first()
  )
  if (!raw.success) throw new HTTPException(404, { message: 'Event not found' })
  const endedDay = dayjs(job.post.createdAt).tz('Asia/Tokyo').startOf('day')
  // 開始日も日本時間の日にちで比べる。開始が同じ日なら、時刻を持つ開始日でも終了として書く。
  const startedDay = dayjs(raw.data.start_date).tz('Asia/Tokyo').startOf('day')
  const writesEndedAt = raw.data.ended_at === null && !endedDay.isBefore(startedDay)
  const lease: SqlGuard = {
    sql: `EXISTS (SELECT 1 FROM ${target.table} WHERE ${target.column}=? AND lease_token=? AND status=?)`,
    values: [target.id, token, job.status]
  }
  const unchanged: SqlGuard = {
    sql: 'EXISTS (SELECT 1 FROM events WHERE id=? AND ended_at IS NULL AND updated_at=?)',
    values: [eventId, raw.data.updated_at]
  }
  const gate: SqlGuard = writesEndedAt
    ? { sql: `${lease.sql} AND ${unchanged.sql}`, values: [...lease.values, ...unchanged.values] }
    : lease
  const referenceId = crypto.randomUUID()
  const timestamp = toD1DateTime(now)
  const insert = env.DB.prepare(`INSERT INTO event_reference_urls (id,event_id,type,url,created_at,updated_at)
    SELECT ?,?,'end',?,?,? WHERE NOT EXISTS (SELECT 1 FROM event_reference_urls WHERE event_id=? AND url=?)
    AND ${gate.sql}`).bind(
    referenceId,
    eventId,
    job.sourceUrl,
    timestamp,
    timestamp,
    eventId,
    job.sourceUrl,
    ...gate.values
  )
  const promote = env.DB.prepare(`UPDATE event_reference_urls SET type='end',updated_at=?
    WHERE event_id=? AND url=? AND type='announce' AND ${gate.sql}`).bind(
    timestamp,
    eventId,
    job.sourceUrl,
    ...gate.values
  )
  const references = [insert, promote]
  const conflict = async () => {
    const held = await env.DB.prepare(`SELECT 1 AS held WHERE ${lease.sql}`)
      .bind(...lease.values)
      .first()
    return new HTTPException(409, {
      message: held === null ? 'Job lease lost' : 'Event changed concurrently; retry required'
    })
  }
  if (!writesEndedAt) return { statements: references, guard: { sql: '', values: [] }, writesEndedAt, conflict }

  const current = await readAtomicManualEvent(env, eventId)
  const updatedAtMs = Math.max(now, current.updatedAt.getTime() + 1)
  const endedAtValue = toD1DateTime(endedDay)
  const updatedAtValue = toD1DateTime(updatedAtMs)
  // 予約するスナップショットにも、batch が書くのと同じ参照URLを反映する（引用先は end が優先される）。
  const referenceUrls = current.referenceUrls.some((reference) => reference.url === job.sourceUrl)
    ? current.referenceUrls.map((reference) =>
        reference.url === job.sourceUrl && reference.type === 'announce'
          ? { ...reference, type: 'end' as const }
          : reference
      )
    : [...current.referenceUrls, { uuid: referenceId, type: 'end' as const, url: job.sourceUrl }]
  const ended = { ...current, endedAt: endedDay.toDate(), updatedAt: dayjs(updatedAtMs).toDate(), referenceUrls }
  const detail = EventDetailSchema.safeParse({
    ...ended,
    ...calculateEventStatus(ended, dayjs(updatedAtMs).toISOString())
  })
  if (!detail.success) throw new Error('Invalid linked event snapshot')
  const applied: SqlGuard = {
    sql: 'EXISTS (SELECT 1 FROM events WHERE id=? AND ended_at=? AND updated_at=?)',
    values: [eventId, endedAtValue, updatedAtValue]
  }
  const update = env.DB.prepare(
    `UPDATE events SET ended_at=?,updated_at=? WHERE id=? AND ended_at IS NULL AND updated_at=? AND ${lease.sql}`
  ).bind(endedAtValue, updatedAtValue, eventId, raw.data.updated_at, ...lease.values)
  // 公開前のイベントは投稿しない（イベント編集の保存と同じ）。
  const posts = detail.data.isVerified
    ? socialInsertStatements(
        env,
        eventSocialSnapshot(detail.data, 'updated'),
        `WHERE ${applied.sql} AND ${lease.sql}`,
        [...applied.values, ...lease.values]
      )
    : []
  return {
    statements: [...references, update, ...posts],
    guard: { sql: ` AND ${applied.sql}`, values: applied.values },
    writesEndedAt,
    conflict
  }
}
