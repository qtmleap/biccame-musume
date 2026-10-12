import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { getAdminWebhookEvents, getWebhookEventIds } from '@api/services/event-service'
import type { Bindings } from '@api/types/bindings'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const ids = {
  automatic: '550e8400-e29b-41d4-a716-446655440001',
  approved: '550e8400-e29b-41d4-a716-446655440002',
  manual: '550e8400-e29b-41d4-a716-446655440003',
  held: '550e8400-e29b-41d4-a716-446655440004',
  ignored: '550e8400-e29b-41d4-a716-446655440005'
}

test('Webhook由来の新規作成だけを一覧に含み、保留承認・手動リンクを区別する', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-events-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const env = await mf.getBindings<Bindings>()
    const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) {
      const sql = await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')
      await env.DB.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))
    }
    expect(await getWebhookEventIds(env)).toEqual([])
    expect(await getAdminWebhookEvents(env)).toEqual([])
    for (const [name, id] of Object.entries(ids)) {
      await env.DB.prepare(`INSERT INTO events
        (id,title,category,start_date,clef_post_id,created_at,updated_at)
        VALUES (?,?,'ackey',1,?,1,1)`)
        .bind(id, name, name === 'manual' ? null : name)
        .run()
      await env.DB.prepare(
        "INSERT INTO event_stores(id,event_id,store_key,created_at,updated_at) VALUES (?, ?, 'akiba',1,1)"
      )
        .bind(crypto.randomUUID(), id)
        .run()
      await env.DB.prepare(`INSERT INTO webhook_event_jobs
        (post_id,post_json,source_url,event_uuid,event_id,status,created_at,updated_at)
        VALUES (?,'{}','https://example.invalid/post',?,?,?,1,1)`)
        .bind(
          name,
          name === 'manual' ? crypto.randomUUID() : id,
          id,
          name === 'held' || name === 'ignored' ? name : 'registered'
        )
        .run()
    }
    await env.DB.prepare(`INSERT INTO webhook_event_jobs
      (post_id,post_json,source_url,event_uuid,event_id,status,created_at,updated_at)
      VALUES ('duplicate','{}','https://example.invalid/duplicate',?,?,'registered',1,1)`)
      .bind(crypto.randomUUID(), ids.automatic)
      .run()
    await env.DB.prepare(`INSERT INTO webhook_event_jobs
      (post_id,post_json,source_url,event_uuid,event_id,status,created_at,updated_at)
      VALUES ('deleted','{}','https://example.invalid/deleted',?,?,'registered',1,1)`)
      .bind('550e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440006')
      .run()
    const selected = await getWebhookEventIds(env)
    expect(selected.sort()).toEqual([ids.automatic, ids.approved].sort())
    expect(selected).toHaveLength(2)
  } finally {
    await mf.dispose()
  }
}, 30_000)
