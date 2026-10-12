import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { isSocialSnapshotPublic } from '@api/lib/social-public-snapshot'
import { processSocialJob, type SocialDependencies, saveSocialSnapshot } from '@api/services/social-posting'
import type { Bindings } from '@api/types/bindings'
import { type SocialSnapshot, snapshotEventIds } from '@biccame/shared/social'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { dailySnapshot, socialUuid } from './fixtures/social-snapshots'

const mutations = ['UPDATE events SET is_verified=0 WHERE id=?', 'DELETE FROM events WHERE id=?']

const createEnv = async (mf: Miniflare) => {
  const env = Object.assign(await mf.getBindings<Bindings>(), {
    X_POSTING_ENABLED: 'true',
    DISCORD_POSTING_ENABLED: 'true'
  })
  await env.DB.exec(
    (await readFile('prisma/migrations/20261011183749_social_post_jobs/migration.sql', 'utf8'))
      .replace(/^--.*$/gm, '')
      .replace(/\n/g, ' ')
  )
  await env.DB.exec('CREATE TABLE events (id TEXT PRIMARY KEY, is_verified INTEGER, is_preliminary INTEGER);')
  return env
}

/** 全 uuid を公開済みで入れ直す。 */
const seedEvents = async (env: Bindings, ids: string[], preliminary = 0) => {
  await env.DB.prepare('DELETE FROM events').run()
  await env.DB.batch(ids.map((id) => env.DB.prepare('INSERT INTO events VALUES (?,1,?)').bind(id, preliminary)))
}

test('D1 delivery blocks either channel when any event, including one only in hiddenEventIds, becomes private or deleted, also during render', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-delivery-privacy-test',
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const env = await createEnv(mf)
    // 開始9行（題名が違うのでまとまらない）は8行を超え、1件が「ほか 1件」に隠れる。
    const base = dailySnapshot(9, 2)
    const [hiddenId] = base.images.flatMap((image) => (image.type === 'summary' ? image.hiddenEventIds : []))
    expect(hiddenId).toBeDefined()
    const ids = snapshotEventIds(base)
    expect(ids).toHaveLength(11)
    // 表示された行の uuid（隠れていない）と、隠れた uuid の両方を、別々に非公開化して確かめる。
    const shownId = base.images.flatMap((image) => (image.type === 'summary' ? image.rows[0].eventIds : []))[0]
    expect(shownId).not.toBe(hiddenId)
    const sent: SocialSnapshot[] = []
    for (const [mutationIndex, mutation] of mutations.entries()) {
      for (const [targetIndex, target] of [shownId, hiddenId].entries()) {
        for (const duringRender of [false, true]) {
          await seedEvents(env, ids)
          const snapshot: SocialSnapshot = { ...base, key: `privacy:${mutationIndex}:${targetIndex}:${duringRender}` }
          await saveSocialSnapshot(env, snapshot)
          if (!duringRender) await env.DB.prepare(mutation).bind(target).run()
          const renders: number[] = []
          const deps: SocialDependencies = {
            render: async (_env, saved, index) => {
              expect(saved.text).toBe(snapshot.text)
              renders.push(index)
              if (duringRender && index === 1) await env.DB.prepare(mutation).bind(target).run()
              return new Uint8Array([index])
            },
            send: async (_env, _channel, saved) => {
              sent.push(saved)
              return { status: 'sent', id: 'unexpected' }
            }
          }
          const jobs = await env.DB.prepare('SELECT id FROM social_post_jobs WHERE key=?')
            .bind(snapshot.key)
            .all<{ id: string }>()
          expect(jobs.results).toHaveLength(2)
          for (const job of jobs.results) await processSocialJob(env, job.id, deps)
          const statuses = await env.DB.prepare('SELECT status,last_error FROM social_post_jobs WHERE key=?')
            .bind(snapshot.key)
            .all<{ status: string; last_error: string }>()
          expect(statuses.results).toHaveLength(2)
          expect(statuses.results.every((row) => row.status === 'skipped' && row.last_error === 'not_public')).toBe(
            true
          )
          // 描画中の非公開化は、描画後・送信前の再確認で止まる。開始前に非公開なら描画もしない。
          expect(renders.length > 0).toBe(duringRender)
          expect(sent).toHaveLength(0)
        }
      }
    }
    // 検証済みなら、未確定情報（is_preliminary=1）でも送信する。
    await seedEvents(env, ids, 1)
    const preliminary: SocialSnapshot = { ...base, key: 'verified-preliminary' }
    await saveSocialSnapshot(env, preliminary)
    const jobs = await env.DB.prepare('SELECT id FROM social_post_jobs WHERE key=?')
      .bind(preliminary.key)
      .all<{ id: string }>()
    for (const job of jobs.results) {
      await processSocialJob(env, job.id, {
        render: async (_env, _saved, index) => new Uint8Array([index]),
        send: async (_env, _channel, saved) => {
          sent.push(saved)
          return { status: 'sent', id: 'verified-preliminary' }
        }
      })
    }
    expect(sent).toHaveLength(2)
  } finally {
    await mf.dispose()
  }
}, 60000)

test('public check queries a 50-uuid snapshot once and fails when any event, including a hidden one, is non-public', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-public-single-query-test',
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const env = await createEnv(mf)
    // 毎週の最大に近い1投稿ぶん（片側25件ずつ、表示8行 + 隠れた uuid）。
    const snapshot = dailySnapshot(25, 25)
    const ids = snapshotEventIds(snapshot)
    expect(ids).toHaveLength(50)
    const hiddenIds = snapshot.images.flatMap((image) => (image.type === 'summary' ? image.hiddenEventIds : []))
    expect(hiddenIds.length).toBeGreaterThan(0)
    await seedEvents(env, ids)
    // 問い合わせは1回の prepare だけで、束縛変数は uuid 数と同じ。batch は存在しないので呼べば失敗する。
    const statements: number[] = []
    const counted = Object.assign({}, env, {
      DB: {
        prepare: (query: string) => {
          statements.push(query.split('?').length - 1)
          return env.DB.prepare(query)
        }
      }
    })
    expect(await isSocialSnapshotPublic(counted, snapshot)).toBe(true)
    expect(statements).toEqual([50])
    // 先頭・中間・末尾と、隠れた uuid のどれが非公開・削除でも false。
    for (const target of [ids[0], ids[25], ids[49], hiddenIds[0], hiddenIds[hiddenIds.length - 1]]) {
      for (const mutation of mutations) {
        await seedEvents(env, ids)
        await env.DB.prepare(mutation).bind(target).run()
        expect(await isSocialSnapshotPublic(env, snapshot)).toBe(false)
      }
    }
    // 隠れた uuid だけが非公開でも、表示された行が全部公開済みでも false。
    await seedEvents(env, ids)
    await env.DB.prepare('UPDATE events SET is_verified=0 WHERE id=?').bind(hiddenIds[0]).run()
    expect(await isSocialSnapshotPublic(env, snapshot)).toBe(false)
    // 複数件が非公開でも件数の突き合わせで漏れない。
    await seedEvents(env, ids)
    await env.DB.prepare('UPDATE events SET is_verified=0 WHERE id IN (?,?)').bind(ids[1], ids[48]).run()
    expect(await isSocialSnapshotPublic(env, snapshot)).toBe(false)
    // events に存在しない uuid が混ざっていても false。
    await seedEvents(env, ids.slice(0, 49))
    expect(await isSocialSnapshotPublic(env, snapshot)).toBe(false)
  } finally {
    await mf.dispose()
  }
}, 60000)

test('public check accepts exactly 100 uuids and throws over the D1 bound variable limit without querying', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-public-limit-test',
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const env = await createEnv(mf)
    // 上限ちょうど（100件）は1回の問い合わせで確認できる。
    const atLimit = dailySnapshot(50, 50)
    const atLimitIds = snapshotEventIds(atLimit)
    expect(atLimitIds).toHaveLength(100)
    await seedEvents(env, atLimitIds)
    expect(await isSocialSnapshotPublic(env, atLimit)).toBe(true)
    // 超えたら黙って false にせず、問い合わせる前に原因が分かる例外にする。
    const overLimit = dailySnapshot(51, 50)
    const overLimitIds = snapshotEventIds(overLimit)
    expect(overLimitIds).toHaveLength(101)
    await seedEvents(env, overLimitIds)
    const queries: string[] = []
    const counted = Object.assign({}, env, {
      DB: {
        prepare: (query: string) => {
          queries.push(query)
          return env.DB.prepare(query)
        }
      }
    })
    await expect(isSocialSnapshotPublic(counted, overLimit)).rejects.toThrow('over the D1 bound variable limit')
    expect(queries).toEqual([])
  } finally {
    await mf.dispose()
  }
}, 60000)

test('public check rejects a snapshot without any event uuid and does not query D1', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-public-empty-test',
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const env = await createEnv(mf)
    await env.DB.prepare('INSERT INTO events VALUES (?,1,0)').bind(socialUuid(1)).run()
    const empty: SocialSnapshot = {
      kind: 'daily',
      key: 'daily:2026-10-12',
      scheduledAt: '2026-10-12T00:00:00.000Z',
      text: '本文',
      images: [
        { type: 'empty', side: 'starting', headline: '2026年10月12日(月)' },
        { type: 'empty', side: 'ending', headline: '2026年10月12日(月)' }
      ]
    }
    expect(snapshotEventIds(empty)).toEqual([])
    expect(await isSocialSnapshotPublic(env, empty)).toBe(false)
  } finally {
    await mf.dispose()
  }
})
