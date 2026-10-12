import { expect, test } from 'bun:test'
import { createSocialOgRoutes } from '@api/routes/og-social'
import type { Bindings } from '@api/types/bindings'
import { type SocialSnapshot, snapshotEventIds } from '@biccame/shared/social'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { dailySnapshot } from './fixtures/social-snapshots'

const JOB_ID = '550e8400-e29b-41d4-a716-00000000aaaa'

const png = (index: number) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, index])

test('OG route serves images by 0-based index, validates the index with 404, and caches per index', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-og-route-test',
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB'],
      kvNamespaces: ['BICCAME_MUSUME_EVENTS']
    })
  )
  try {
    const env = await mf.getBindings<Bindings>()
    await env.DB.exec(
      'CREATE TABLE events (id TEXT PRIMARY KEY, is_verified INTEGER, is_preliminary INTEGER); CREATE TABLE social_post_jobs (id TEXT PRIMARY KEY, snapshot_json TEXT);'
    )
    // 開始8件・終了8件で、画像は4枚。
    const snapshot: SocialSnapshot = dailySnapshot(8, 8)
    expect(snapshot.images).toHaveLength(4)
    const ids = snapshotEventIds(snapshot)
    await env.DB.batch(ids.map((id) => env.DB.prepare('INSERT INTO events VALUES (?,1,0)').bind(id)))
    await env.DB.prepare('INSERT INTO social_post_jobs VALUES (?,?)').bind(JOB_ID, JSON.stringify(snapshot)).run()
    const rendered: number[] = []
    const app = createSocialOgRoutes(async (_env, saved, index) => {
      expect(saved.key).toBe(snapshot.key)
      rendered.push(index)
      return png(index)
    })
    const request = (path: string, target: Bindings = env) => app.request(`/social/${path}`, undefined, target)

    // 0 起点で、4枚のどれも取れる。.png 付きも同じ。
    for (const index of [0, 1, 2, 3]) {
      const response = await request(`${JOB_ID}/${index}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(png(index))
    }
    expect(rendered).toEqual([0, 1, 2, 3])
    const withExtension = await request(`${JOB_ID}/1.png`)
    expect(withExtension.status).toBe(200)
    // 同じ index はキャッシュから返り、別の index とは混ざらない。
    expect(new Uint8Array(await withExtension.arrayBuffer())).toEqual(png(1))
    expect(rendered).toEqual([0, 1, 2, 3])

    // 範囲外・非整数・負数・先頭ゼロ・小数・符号付き・旧パスは 404 で、描画もしない。
    for (const invalid of [
      `${JOB_ID}/4`,
      `${JOB_ID}/4.png`,
      `${JOB_ID}/99`,
      `${JOB_ID}/-1`,
      `${JOB_ID}/-1.png`,
      `${JOB_ID}/1.5`,
      `${JOB_ID}/1.5.png`,
      `${JOB_ID}/01`,
      `${JOB_ID}/+1`,
      `${JOB_ID}/abc`,
      `${JOB_ID}/0x1`,
      `${JOB_ID}/1e0`,
      `${JOB_ID}/.png`,
      `${JOB_ID}/1.jpg`,
      `${JOB_ID}/99999999999999999999999`,
      `${JOB_ID}.png`,
      `${JOB_ID}`,
      `invalid/0`,
      `550e8400-e29b-41d4-a716-000000000009/0`
    ]) {
      expect([invalid, (await request(invalid)).status]).toEqual([invalid, 404])
    }
    expect(rendered).toEqual([0, 1, 2, 3])

    // 公開確認はキャッシュ取得より先。キャッシュ済みの index も、1件でも非公開なら 404。
    const lastId = ids[ids.length - 1]
    await env.DB.prepare('UPDATE events SET is_verified = 0 WHERE id = ?').bind(lastId).run()
    for (const index of [0, 3]) expect((await request(`${JOB_ID}/${index}`)).status).toBe(404)
    await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(lastId).run()
    expect((await request(`${JOB_ID}/0`)).status).toBe(404)
    await env.DB.prepare('INSERT INTO events VALUES (?,1,0)').bind(lastId).run()
    expect((await request(`${JOB_ID}/0`)).status).toBe(200)
    expect(rendered).toEqual([0, 1, 2, 3])

    // KV が壊れていても描画して返す。キャッシュのキーは index ごと。
    const keys: string[] = []
    const brokenCache = Object.assign({}, env, {
      BICCAME_MUSUME_EVENTS: {
        ...env.BICCAME_MUSUME_EVENTS,
        get: async (key: string) => {
          keys.push(key)
          throw new Error('synthetic failure')
        },
        put: async () => {
          throw new Error('synthetic failure')
        }
      }
    })
    const uncached = await request(`${JOB_ID}/2`, brokenCache)
    expect(uncached.status).toBe(200)
    expect(new Uint8Array(await uncached.arrayBuffer())).toEqual(png(2))
    await request(`${JOB_ID}/3`, brokenCache)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(new RegExp(`^og:social:v2:${JOB_ID}:2:[0-9a-f]{64}$`))
    expect(keys[1]).toMatch(new RegExp(`^og:social:v2:${JOB_ID}:3:[0-9a-f]{64}$`))
    expect(rendered).toEqual([0, 1, 2, 3, 2, 3])
  } finally {
    await mf.dispose()
  }
}, 60000)

test('OG route returns 404 for a snapshot whose hidden-only event is no longer public, and for unreadable snapshots', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-og-route-hidden-test',
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB'],
      kvNamespaces: ['BICCAME_MUSUME_EVENTS']
    })
  )
  try {
    const env = await mf.getBindings<Bindings>()
    await env.DB.exec(
      'CREATE TABLE events (id TEXT PRIMARY KEY, is_verified INTEGER, is_preliminary INTEGER); CREATE TABLE social_post_jobs (id TEXT PRIMARY KEY, snapshot_json TEXT);'
    )
    // 片側9件は8行を超え、1件が「ほか 1件」に隠れる。
    const snapshot = dailySnapshot(9, 1)
    const hiddenId = snapshot.images.flatMap((image) => (image.type === 'summary' ? image.hiddenEventIds : []))[0]
    expect(hiddenId).toBeDefined()
    const ids = snapshotEventIds(snapshot)
    await env.DB.batch(ids.map((id) => env.DB.prepare('INSERT INTO events VALUES (?,1,0)').bind(id)))
    await env.DB.prepare('INSERT INTO social_post_jobs VALUES (?,?)').bind(JOB_ID, JSON.stringify(snapshot)).run()
    const app = createSocialOgRoutes(async (_env, _saved, index) => png(index))
    const request = () => app.request(`/social/${JOB_ID}/0`, undefined, env)
    expect((await request()).status).toBe(200)
    await env.DB.prepare('UPDATE events SET is_verified = 0 WHERE id = ?').bind(hiddenId).run()
    expect((await request()).status).toBe(404)
    await env.DB.prepare('UPDATE events SET is_verified = 1').run()
    expect((await request()).status).toBe(200)
    for (const invalid of ['{', JSON.stringify({ kind: 'preparing' }), JSON.stringify({ ...snapshot, images: [] })]) {
      await env.DB.prepare('UPDATE social_post_jobs SET snapshot_json = ?').bind(invalid).run()
      expect((await request()).status).toBe(404)
    }
  } finally {
    await mf.dispose()
  }
}, 60000)
