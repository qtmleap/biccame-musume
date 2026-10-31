import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getWebhookJob, insertWebhookJob, registerWebhookEvent } from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import type { GapStatus } from '@biccame/shared/event-detect/viewer'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { SocialSnapshotSchema } from '@biccame/shared/social'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { seedCandidate } from './webhook-relink'

const root = resolve(import.meta.dirname, '../..')

/** 終了ツイートの投稿日時（日本時間 2026-10-20 12:00）。連携先イベントの開始日（既定 2026-10-11 JST）より後。 */
export const END_AT = '2026-10-20T03:00:00Z'
/** ended_at は投稿日の日本時間 0 時。管理画面のフォームが日付だけを保存する形と同じ。 */
export const END_AT_STORED = '2026-10-19T15:00:00.000+00:00'

export type Flags = { x?: string; discord?: string }
export type SocialJobRow = { id: string; channel: string; key: string; status: string; snapshotJson: string }

/** ローカルのインメモリ D1 に実マイグレーションを順に適用して、テスト本体へ bindings を渡す。 */
export const withDatabase = async (run: (bindings: Bindings) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-link-ended-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const bindings = await mf.getBindings<Bindings>()
    const migrations = (await readdir(resolve(root, 'prisma/migrations'), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) {
      const sql = await readFile(resolve(root, 'prisma/migrations', name, 'migration.sql'), 'utf8')
      await bindings.DB.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))
    }
    await run(bindings)
  } finally {
    await mf.dispose()
  }
}

/** 投稿フラグ付きの env。キューに積まれたメッセージは丸ごと sent へ記録する。 */
export const withFlags = (bindings: Bindings, flags: Flags, sent: unknown[] = []) =>
  Object.assign(
    { ...bindings },
    {
      X_POSTING_ENABLED: flags.x,
      DISCORD_POSTING_ENABLED: flags.discord,
      EVENT_DETECTION_QUEUE: {
        send: async (message: unknown) => {
          sent.push(message)
        }
      }
    }
  )

export const postIdOf = (index: number) => `21092217217735761${String(index).padStart(2, '0')}`

const eventFor = (uuid: string, sourceUrl: string, patch: Partial<EventRequest>): EventRequest => ({
  uuid,
  category: 'limited_card',
  title: '限定名刺配布テスト',
  stores: ['akiba'],
  characterIds: ['akiba'],
  startDate: '2026-10-11T00:00:00+09:00',
  isVerified: true,
  isPreliminary: false,
  shouldTweet: false,
  conditions: [{ uuid: crypto.randomUUID(), type: 'everyone' }],
  referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: sourceUrl }],
  ...patch
})

/** 連携先のイベントを、投稿を積まない構成で登録済みにして uuid を返す（店舗などの子レコードも揃う）。 */
export const seedTargetEvent = async (env: Bindings, index: number, patch: Partial<EventRequest> = {}) => {
  const postId = postIdOf(index)
  const sourceUrl = `https://x.com/bic_akiba/status/${postId}`
  await insertWebhookJob(env, {
    id: postId,
    createdAt: '2026-10-11T00:00:00Z',
    screenName: 'bic_akiba',
    kind: 'original',
    text: '本日より限定名刺を配布',
    url: sourceUrl,
    media: []
  })
  const token = crypto.randomUUID()
  await env.DB.prepare('UPDATE webhook_event_jobs SET status=?,lease_token=?,lease_until=? WHERE post_id=?')
    .bind('processing', token, 4_102_444_800_000, postId)
    .run()
  const job = await getWebhookJob(env, postId)
  const quiet = withFlags(env, {})
  await registerWebhookEvent(quiet, job, eventFor(job.eventUUID, sourceUrl, patch), token)
  return { eventId: job.eventUUID, announceUrl: sourceUrl }
}

/** 管理画面の保留ジョブ（held）を作る。postStatus が null なら回答を持たない。 */
export const seedEndJob = async (
  env: Bindings,
  index: number,
  options: { postStatus?: GapStatus | null; createdAt?: string } = {}
) => {
  const postId = postIdOf(index)
  const sourceUrl = `https://x.com/bic_akiba/status/${postId}`
  await insertWebhookJob(env, {
    id: postId,
    createdAt: options.createdAt === undefined ? END_AT : options.createdAt,
    screenName: 'bic_akiba',
    kind: 'original',
    text: '限定名刺の配布は終了しました',
    url: sourceUrl,
    media: []
  })
  await env.DB.prepare('UPDATE webhook_event_jobs SET status=?,answers_json=? WHERE post_id=?')
    .bind('held', answersOf(options.postStatus === undefined ? 'end' : options.postStatus), postId)
    .run()
  return { postId, sourceUrl }
}

/** 投稿状態（status 質問）が choice を選んだ保存済みの回答。null は回答なし。 */
export const answersOf = (postStatus: GapStatus | null) =>
  postStatus === null
    ? null
    : JSON.stringify({ status: { type: 'choice', choice: postStatus, probabilities: { [postStatus]: 0.9 } } })

export const eventRow = (env: Bindings, id: string) =>
  env.DB.prepare('SELECT ended_at,updated_at FROM events WHERE id=?').bind(id).first<{
    ended_at: string | null
    updated_at: string
  }>()

export const references = async (env: Bindings, eventId: string) =>
  (
    await env.DB.prepare('SELECT type,url FROM event_reference_urls WHERE event_id=? ORDER BY type,url')
      .bind(eventId)
      .all<{ type: string; url: string }>()
  ).results

export const socialJobs = async (env: Bindings) =>
  (
    await env.DB.prepare(
      'SELECT id,channel,key,status,snapshot_json AS snapshotJson FROM social_post_jobs ORDER BY channel,key'
    ).all<SocialJobRow>()
  ).results

export const snapshotOf = (row: SocialJobRow) => {
  const raw: unknown = JSON.parse(row.snapshotJson)
  const parsed = SocialSnapshotSchema.safeParse(raw)
  if (!parsed.success) throw new Error(`Invalid social snapshot in ${row.channel} job`)
  return parsed.data
}

export const jobRow = (env: Bindings, postId: string) =>
  env.DB.prepare('SELECT status,event_id,reasons_json FROM webhook_event_jobs WHERE post_id=?')
    .bind(postId)
    .first<{ status: string; event_id: string | null; reasons_json: string }>()

/**
 * nth 回目の D1 batch の直前に run を実行する env。読み取りの後に別経路が割り込んだ状況を再現する。
 * 終了連携では 1 回目が読み取り（readAtomicManualEvent）、2 回目が書き込みなので、既定は 2。fired で実際に割り込んだことを確かめる。
 */
export const interruptBeforeBatch = (env: Bindings, run: () => Promise<void>, nth = 2) => {
  const state = { calls: 0, fired: false }
  const db = new Proxy(env.DB, {
    get: (target, property) => {
      if (property !== 'batch') {
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      }
      return async (statements: D1PreparedStatement[]) => {
        state.calls += 1
        if (state.calls === nth) {
          state.fired = true
          await run()
        }
        return target.batch(statements)
      }
    }
  })
  return { env: Object.assign({ ...env }, { DB: db }), state }
}

/** 複数候補の投稿（親は回答なしの保留）を作り、候補ごとの postStatus を回答に保存する。候補は保留で、並びは statuses の順。 */
export const seedEndCandidates = async (env: Bindings, index: number, statuses: GapStatus[]) => {
  const { postId, sourceUrl } = await seedEndJob(env, index, { postStatus: null })
  const uuids = statuses.map(() => crypto.randomUUID())
  for (const [position, uuid] of uuids.entries()) {
    await seedCandidate(env, postId, {
      uuid,
      status: 'held',
      reasons: [],
      eventId: null,
      notificationStatus: 'pending',
      createdAt: 1791676800000 + position
    })
    await env.DB.prepare('UPDATE webhook_event_candidates SET answers_json=? WHERE event_uuid=?')
      .bind(answersOf(statuses[position]), uuid)
      .run()
  }
  return { postId, sourceUrl, uuids }
}

export const candidateRow = (env: Bindings, uuid: string) =>
  env.DB.prepare('SELECT status,event_id,lease_token FROM webhook_event_candidates WHERE event_uuid=?')
    .bind(uuid)
    .first<{ status: string; event_id: string | null; lease_token: string | null }>()
