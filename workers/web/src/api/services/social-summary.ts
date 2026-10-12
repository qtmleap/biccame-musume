import { socialInsertStatements } from '@api/services/social-posting'
import type { Bindings } from '@api/types/bindings'
import {
  buildSummarySnapshot,
  isJstMonday,
  jstDateKey,
  type SocialSummaryEvents,
  type SocialSummaryKind,
  socialPostKey
} from '@biccame/shared/domain/social-post'
import { SocialSnapshotSchema } from '@biccame/shared/social'
import dayjs from 'dayjs'
import { z } from 'zod'

export type { SocialSummaryEvents, SocialSummaryKind }

type SummaryBindings = Pick<Bindings, 'DB' | 'X_POSTING_ENABLED' | 'DISCORD_POSTING_ENABLED'>
const RunSchema = z.object({ scheduled_at: z.iso.datetime() })
const MAX_SUMMARY_ATTEMPTS = 5
const SUMMARY_LIFETIME_MS = 48 * 60 * 60 * 1000

/** cron 時刻の JST 日付と、その日が月曜か（月曜は毎週の投稿も作る）。 */
export const socialDateWindow = (scheduledAt: string) => ({
  day: jstDateKey(scheduledAt),
  monday: isJstMonday(scheduledAt)
})

/** 読み取り前にrunを予約し、画像・本文・outboxを同時に確定する。両方0件でも run は ready にして再実行で投稿が生まれないようにする。 */
export const reserveSocialSummary = async (
  env: SummaryBindings,
  kind: SocialSummaryKind,
  scheduledAt: string,
  loadEvents: (scheduledAt: string) => Promise<SocialSummaryEvents>
): Promise<void> => {
  const now = dayjs().valueOf()
  const token = crypto.randomUUID()
  const key = socialPostKey(kind, scheduledAt)
  await expireSocialSummaryRuns(env)
  const claimed = await env.DB.prepare(`INSERT INTO social_summary_runs
    (key,kind,scheduled_at,status,manifest_json,attempts,lease_token,lease_until,created_at,updated_at)
    VALUES (?,?,?,'preparing','[]',1,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET attempts=social_summary_runs.attempts+1,lease_token=excluded.lease_token,lease_until=excluded.lease_until,updated_at=excluded.updated_at
    WHERE social_summary_runs.status='preparing' AND social_summary_runs.attempts<? AND social_summary_runs.created_at>=?
      AND (social_summary_runs.lease_until IS NULL OR social_summary_runs.lease_until<?)`)
    .bind(key, kind, scheduledAt, token, now + 300000, now, now, MAX_SUMMARY_ATTEMPTS, now - SUMMARY_LIFETIME_MS, now)
    .run()
  if (claimed.meta.changes !== 1) return
  try {
    const raw = await env.DB.prepare('SELECT scheduled_at FROM social_summary_runs WHERE key=? AND lease_token=?')
      .bind(key, token)
      .first()
    const run = RunSchema.safeParse(raw)
    if (!run.success) throw new Error('Invalid social summary run')
    const events = await loadEvents(run.data.scheduled_at)
    // manifest は 0件（投稿なし）または1件（1 run = 1投稿）の配列。
    const built = buildSummarySnapshot({ kind, scheduledAt: run.data.scheduled_at, ...events })
    const parsed = z.array(SocialSnapshotSchema).safeParse(built === null ? [] : [built])
    if (!parsed.success) throw new Error('Invalid social summary manifest')
    const guard =
      "WHERE EXISTS (SELECT 1 FROM social_summary_runs WHERE key=? AND lease_token=? AND status='preparing')"
    const statements = parsed.data.flatMap((snapshot) => socialInsertStatements(env, snapshot, guard, [key, token]))
    const results = await env.DB.batch([
      ...statements,
      env.DB.prepare(`UPDATE social_summary_runs SET status='ready',manifest_json=?,lease_token=NULL,lease_until=NULL,updated_at=?
        WHERE key=? AND lease_token=? AND status='preparing'`).bind(
        JSON.stringify(parsed.data),
        dayjs().valueOf(),
        key,
        token
      )
    ])
    if (results.at(-1)?.meta.changes !== 1) throw new Error('Social summary lease lost')
  } finally {
    await env.DB.prepare(
      "UPDATE social_summary_runs SET lease_token=NULL,lease_until=NULL WHERE key=? AND lease_token=? AND status='preparing'"
    )
      .bind(key, token)
      .run()
    await expireSocialSummaryRuns(env)
  }
}

const expireSocialSummaryRuns = async (env: Pick<Bindings, 'DB'>) => {
  const now = dayjs().valueOf()
  await env.DB.prepare(`UPDATE social_summary_runs SET status=CASE WHEN attempts>=? THEN 'failed' ELSE 'expired' END,
    lease_token=NULL,lease_until=NULL,updated_at=? WHERE status='preparing'
    AND (attempts>=? OR created_at<?) AND (lease_until IS NULL OR lease_until<?)`)
    .bind(MAX_SUMMARY_ATTEMPTS, now, MAX_SUMMARY_ATTEMPTS, now - SUMMARY_LIFETIME_MS, now)
    .run()
}

/** 中断されたrunを、最初のcron時刻のまま再実行するための一覧。 */
export const recoverableSocialSummarySchedules = async (env: Pick<Bindings, 'DB'>): Promise<string[]> => {
  await expireSocialSummaryRuns(env)
  const rows = await env.DB.prepare(`SELECT DISTINCT scheduled_at FROM social_summary_runs
    WHERE status='preparing' AND (lease_until IS NULL OR lease_until<?) ORDER BY scheduled_at LIMIT 20`)
    .bind(dayjs().valueOf())
    .all<{ scheduled_at: string }>()
  const parsed = z.array(RunSchema).safeParse(rows.results)
  if (!parsed.success) throw new Error('Invalid recoverable social summary runs')
  return parsed.data.map((row) => row.scheduled_at)
}
