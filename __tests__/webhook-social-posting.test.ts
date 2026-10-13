import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { resolveWebhookJob } from '@api/services/webhook-admin'
import {
  claimWebhookJob,
  getWebhookJob,
  insertWebhookJob,
  registerWebhookEvent,
  releaseWebhookJob
} from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { SocialSnapshotSchema, snapshotEventIds } from '@biccame/shared/social'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

// Webhook で自動登録（または管理画面で「保留を解決して登録」）されたイベントが、
// 同じ D1 batch の中で X / Discord への投稿ジョブ (social_post_jobs) になることを固定する。
// 送信そのもの (processSocialJob) は対象外。実 API・Workers AI・リモート D1/KV には触れない。

const root = resolve(import.meta.dirname, '..')
const TITLE = '限定名刺配布テスト'
const SOURCE_AT = '2026-10-11T00:00:00Z'

type Flags = { x?: string; discord?: string }
type Table = 'events' | 'event_conditions' | 'event_reference_urls' | 'event_stores' | 'social_post_jobs'
type SocialJobRow = { id: string; channel: string; key: string; status: string; snapshotJson: string }

/** ローカルのインメモリ D1 に実マイグレーションを順に適用して、テスト本体へ bindings を渡す。 */
const withDatabase = async (run: (bindings: Bindings) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-social-posting-test',
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

/** 投稿フラグ付きの env。bindings 本体は書き換えず、シナリオごとに独立したコピーを作る。 */
const withFlags = (bindings: Bindings, flags: Flags, sent: string[] = []) =>
  Object.assign(
    { ...bindings },
    {
      X_POSTING_ENABLED: flags.x,
      DISCORD_POSTING_ENABLED: flags.discord,
      EVENT_DETECTION_QUEUE: {
        send: async (message: { postId: string }) => {
          sent.push(message.postId)
        }
      }
    }
  )

const postIdOf = (index: number) => `21092217217735761${String(index).padStart(2, '0')}`

/** 受信済み（queued）のジョブを作る。イベントの uuid は insertWebhookJob が採番する。 */
const seedJob = async (env: Bindings, index: number) => {
  const postId = postIdOf(index)
  const sourceUrl = `https://x.com/bic_akiba/status/${postId}`
  await insertWebhookJob(env, {
    id: postId,
    createdAt: SOURCE_AT,
    screenName: 'bic_akiba',
    kind: 'original',
    text: `本日より限定名刺を配布 ${index}`,
    url: sourceUrl,
    media: []
  })
  return { postId, sourceUrl }
}

/** lease を取って処理中にし、判定結果を書いたジョブと、そのジョブに対応する登録イベントを返す。 */
const seedProcessingJob = async (env: Bindings, index: number) => {
  const { postId, sourceUrl } = await seedJob(env, index)
  const token = await claimWebhookJob(env, postId)
  if (token === null) throw new Error('Webhook job was not claimed')
  await env.DB.prepare(
    'UPDATE webhook_event_jobs SET judged_at=?,confidence=0.99,model=?,question_version=? WHERE post_id=?'
  )
    .bind(1791676800000, 'clef', 'test-v1', postId)
    .run()
  const job = await getWebhookJob(env, postId)
  return { job, token, event: eventFor(job.eventUUID, sourceUrl) }
}

/** 管理画面の保留ジョブ（held）を作る。 */
const seedHeldJob = async (env: Bindings, index: number) => {
  const { postId, sourceUrl } = await seedJob(env, index)
  await env.DB.prepare("UPDATE webhook_event_jobs SET status='held' WHERE post_id=?").bind(postId).run()
  const job = await getWebhookJob(env, postId)
  return { job, event: eventFor(job.eventUUID, sourceUrl) }
}

const eventFor = (uuid: string, sourceUrl: string): EventRequest => ({
  uuid,
  category: 'limited_card',
  title: TITLE,
  stores: ['akiba'],
  startDate: '2026-10-11T00:00:00+09:00',
  isVerified: true,
  isPreliminary: false,
  shouldTweet: false,
  conditions: [{ uuid: crypto.randomUUID(), type: 'everyone' }],
  referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: sourceUrl }]
})

const count = async (env: Bindings, table: Table) =>
  env.DB.prepare(`SELECT count(*) AS total FROM ${table}`).first<number>('total')

const socialJobs = async (env: Bindings) =>
  (
    await env.DB.prepare(
      'SELECT id,channel,key,status,snapshot_json AS snapshotJson FROM social_post_jobs ORDER BY channel'
    ).all<SocialJobRow>()
  ).results

const jobStatus = async (env: Bindings, postId: string) =>
  env.DB.prepare('SELECT status FROM webhook_event_jobs WHERE post_id=?').bind(postId).first<string>('status')

const summarize = (rows: SocialJobRow[]) => rows.map(({ channel, key, status }) => ({ channel, key, status }))

const snapshotOf = (row: SocialJobRow) => {
  const raw: unknown = JSON.parse(row.snapshotJson)
  const parsed = SocialSnapshotSchema.safeParse(raw)
  // 読めないスナップショットは送信側で失敗するため、ここで落とす。
  if (!parsed.success) throw new Error(`Invalid social snapshot in ${row.channel} job`)
  return parsed.data
}

test('webhook registration queues one pending X job and one pending Discord job with a valid created snapshot', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { job, token, event } = await seedProcessingJob(env, 1)
    await registerWebhookEvent(env, job, event, token)

    const key = `created:${job.eventUUID}:initial`
    const rows = await socialJobs(env)
    expect(summarize(rows)).toEqual([
      { channel: 'discord', key, status: 'pending' },
      { channel: 'x', key, status: 'pending' }
    ])
    for (const row of rows) {
      const snapshot = snapshotOf(row)
      expect(snapshot.kind).toBe('created')
      expect(snapshot.key).toBe(key)
      expect(snapshot.text).toContain(TITLE)
      expect(snapshot.text).toContain(`/events/${job.eventUUID}`)
      expect(snapshot.images).toHaveLength(1)
      expect(snapshotEventIds(snapshot)).toEqual([job.eventUUID])
    }
    // 投稿ジョブは、イベントと同じ batch で確定した登録の結果として積まれる。
    expect(await count(env, 'events')).toBe(1)
    expect(await jobStatus(env, job.postId)).toBe('registered')
  })
}, 60000)

for (const scenario of [
  { name: 'X only', flags: { x: 'true', discord: 'false' }, channels: ['x'] },
  { name: 'Discord only', flags: { x: 'false', discord: 'true' }, channels: ['discord'] },
  // ローカル・ステージングの設定。登録は成功するが、投稿ジョブは作らない。
  { name: 'both disabled', flags: { x: 'false', discord: 'false' }, channels: [] },
  { name: 'both unset', flags: {}, channels: [] },
  // 'true' 以外の値は有効として扱わない。
  { name: 'non-true values', flags: { x: 'TRUE', discord: '1' }, channels: [] }
] satisfies { name: string; flags: Flags; channels: string[] }[]) {
  test(`webhook registration queues jobs only for enabled channels (${scenario.name})`, async () => {
    await withDatabase(async (bindings) => {
      const env = withFlags(bindings, scenario.flags)
      const { job, token, event } = await seedProcessingJob(env, 2)
      await registerWebhookEvent(env, job, event, token)

      const key = `created:${job.eventUUID}:initial`
      expect(summarize(await socialJobs(env))).toEqual(
        scenario.channels.map((channel) => ({ channel, key, status: 'pending' }))
      )
      // 投稿しない構成でもイベント自体は登録される。
      expect(await count(env, 'events')).toBe(1)
      expect(await jobStatus(env, job.postId)).toBe('registered')
    })
  }, 60000)
}

test('webhook registration that loses its lease creates neither the event nor any social job', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { job, event } = await seedProcessingJob(env, 3)
    await expect(registerWebhookEvent(env, job, event, 'different-lease')).rejects.toThrow('lease lost')

    for (const table of [
      'events',
      'event_conditions',
      'event_reference_urls',
      'event_stores',
      'social_post_jobs'
    ] as const) {
      expect(await count(env, table)).toBe(0)
    }
    expect(await jobStatus(env, job.postId)).toBe('processing')
  })
}, 60000)

test('replaying a finished registration never duplicates social jobs, and a replay after the lease is released is rejected', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { job, token, event } = await seedProcessingJob(env, 4)
    await registerWebhookEvent(env, job, event, token)
    const before = await socialJobs(env)
    expect(before).toHaveLength(2)

    // lease を持ったままの再実行は、イベントも投稿ジョブも増やさない（登録済みで INSERT のガードが外れ、
    // ジョブ側の最終 UPDATE は status を見ないため resolve する）。成否ではなく「増えないこと」だけを固定する。
    await Promise.allSettled([registerWebhookEvent(env, job, event, token)])
    expect(await socialJobs(env)).toEqual(before)
    expect(await count(env, 'events')).toBe(1)

    // 処理側は登録後に lease を解放する。解放後に古い token で再実行すると lease lost になり、何も増えない。
    await releaseWebhookJob(env, job.postId, token)
    await expect(registerWebhookEvent(env, job, event, token)).rejects.toThrow('lease lost')
    expect(await socialJobs(env)).toEqual(before)
    expect(await count(env, 'events')).toBe(1)
  })
}, 60000)

test('an existing job with the same channel and key is kept while registration and the other channel still succeed', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const { job, token, event } = await seedProcessingJob(env, 5)
    const key = `created:${job.eventUUID}:initial`
    // 同じ (channel, key) の投稿ジョブが先にある状態。ON CONFLICT(channel,key) DO NOTHING で上書きされない。
    await env.DB.prepare(
      `INSERT INTO social_post_jobs (id,channel,key,snapshot_json,status,available_at,created_at,updated_at)
      VALUES (?,'x',?,?,'pending',1,1,1)`
    )
      .bind('seeded-x-job', key, '{"seeded":true}')
      .run()
    await registerWebhookEvent(env, job, event, token)

    const rows = await socialJobs(env)
    expect(summarize(rows)).toEqual([
      { channel: 'discord', key, status: 'pending' },
      { channel: 'x', key, status: 'pending' }
    ])
    const x = rows.find((row) => row.channel === 'x')
    expect(x).toMatchObject({ id: 'seeded-x-job', snapshotJson: '{"seeded":true}' })
    expect(await count(env, 'events')).toBe(1)
    expect(await jobStatus(env, job.postId)).toBe('registered')
  })
}, 60000)

test('resolving a held job with register queues X and Discord jobs just like automatic registration', async () => {
  await withDatabase(async (bindings) => {
    const sent: string[] = []
    const env = withFlags(bindings, { x: 'true', discord: 'true' }, sent)
    const { job, event } = await seedHeldJob(env, 6)
    const resolved = await resolveWebhookJob(env, job.postId, { action: 'register', event })

    const key = `created:${job.eventUUID}:initial`
    const rows = await socialJobs(env)
    expect(summarize(rows)).toEqual([
      { channel: 'discord', key, status: 'pending' },
      { channel: 'x', key, status: 'pending' }
    ])
    for (const row of rows) {
      const snapshot = snapshotOf(row)
      expect(snapshot.kind).toBe('created')
      expect(snapshot.text).toContain(TITLE)
      expect(snapshotEventIds(snapshot)).toEqual([job.eventUUID])
    }
    expect(resolved.status).toBe('registered')
    expect(resolved.eventId).toBe(job.eventUUID)
    expect(await count(env, 'events')).toBe(1)
    // 登録後の通知処理のため、ジョブはキューへ積み直される。
    expect(sent).toEqual([job.postId])
  })
}, 60000)

test('resolving a held job with register queues only the channels enabled by the flags', async () => {
  await withDatabase(async (bindings) => {
    const env = withFlags(bindings, { x: 'true', discord: 'false' })
    const { job, event } = await seedHeldJob(env, 7)
    await resolveWebhookJob(env, job.postId, { action: 'register', event })
    expect(summarize(await socialJobs(env))).toEqual([
      { channel: 'x', key: `created:${job.eventUUID}:initial`, status: 'pending' }
    ])
  })
}, 60000)

test('rejecting or linking a held job never queues a post', async () => {
  await withDatabase(async (bindings) => {
    // 既存イベントは投稿しない構成で作り、その後に投稿を有効にして reject / link を解決する。
    const quiet = withFlags(bindings, {})
    const existing = await seedProcessingJob(quiet, 8)
    await registerWebhookEvent(quiet, existing.job, existing.event, existing.token)
    expect(await count(quiet, 'social_post_jobs')).toBe(0)

    const env = withFlags(bindings, { x: 'true', discord: 'true' })
    const rejected = await seedHeldJob(env, 9)
    await resolveWebhookJob(env, rejected.job.postId, { action: 'reject' })
    const linked = await seedHeldJob(env, 10)
    await resolveWebhookJob(env, linked.job.postId, { action: 'link', eventId: existing.job.eventUUID })

    expect(await jobStatus(env, rejected.job.postId)).toBe('ignored')
    expect(await jobStatus(env, linked.job.postId)).toBe('registered')
    expect(await count(env, 'social_post_jobs')).toBe(0)
  })
}, 60000)
