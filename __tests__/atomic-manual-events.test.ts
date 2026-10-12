import { expect, spyOn, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import routes from '@api/routes/event'
import { createEvent, readAtomicManualEvent, updateEvent } from '@api/services/event-service'
import type { Bindings } from '@api/types/bindings'
import { socialEventView } from '@biccame/shared/domain/social-post'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { SocialSnapshotSchema } from '@biccame/shared/social'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { eventRequest } from './fixtures/event-announcement'

const database = async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'atomic-manual-events',
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const env = Object.assign(await mf.getBindings<Bindings>(), {
      ENVIRONMENT: 'local',
      X_POSTING_ENABLED: 'true',
      DISCORD_POSTING_ENABLED: 'true'
    })
    const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) {
      await env.DB.exec(
        (await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ')
      )
    }
    return { mf, env }
  } catch (error) {
    await mf.dispose()
    throw error
  }
}

test('atomic manual create is concurrent-idempotent and snapshots committed child IDs', async () => {
  const { mf, env } = await database()
  try {
    const request: EventRequest = {
      ...eventRequest,
      conditions: [
        ...eventRequest.conditions,
        { uuid: '33333333-3333-4333-a333-333333333333', type: 'purchase', purchaseAmount: 100 }
      ],
      referenceUrls: [
        ...eventRequest.referenceUrls,
        { uuid: '44444444-4444-4444-a444-444444444444', type: 'start', url: 'https://example.com/start' }
      ],
      stores: ['akiba', 'kawasaki']
    }
    const results = await Promise.all([createEvent(env, request), createEvent(env, request)])
    expect(results[0].event).toEqual(results[1].event)
    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM events').first<number>('n')).toBe(1)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM event_conditions').first<number>('n')).toBe(2)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM event_reference_urls').first<number>('n')).toBe(2)
    const jobs = await env.DB.prepare('SELECT channel,snapshot_json FROM social_post_jobs ORDER BY channel').all<{
      channel: string
      snapshot_json: string
    }>()
    expect(jobs.results.map((job) => job.channel)).toEqual(['discord', 'x'])
    const snapshot = SocialSnapshotSchema.safeParse(JSON.parse(jobs.results[0].snapshot_json))
    expect(snapshot.success).toBe(true)
    if (!snapshot.success) throw new Error('Missing frozen snapshot')
    const saved = await readAtomicManualEvent(env, eventRequest.uuid)
    // 保存した行（条件の uuid は保存時に採番し直される）と同じ内容が、固定済みの1件表示に入っている。
    expect(snapshot.data.images).toEqual([{ type: 'event', event: socialEventView(saved) }])
    expect(saved.conditions[0].uuid).not.toBe(eventRequest.conditions[0].uuid)
    expect(saved.referenceUrls[0].uuid).not.toBe(eventRequest.referenceUrls[0].uuid)
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM social_post_jobs WHERE channel='mutation'").first<number>('n')
    ).toBe(0)
  } finally {
    await mf.dispose()
  }
}, 60000)

test('outbox insertion failure rolls back manual event and children, including updates', async () => {
  const { mf, env } = await database()
  try {
    await env.DB.exec(
      "CREATE TRIGGER reject_public_outbox BEFORE INSERT ON social_post_jobs WHEN NEW.channel='discord' BEGIN SELECT RAISE(ABORT, 'synthetic outbox failure'); END;"
    )
    await expect(createEvent(env, eventRequest)).rejects.toThrow()
    expect(await env.DB.prepare('SELECT count(*) AS n FROM events').first<number>('n')).toBe(0)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM event_conditions').first<number>('n')).toBe(0)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM social_post_jobs').first<number>('n')).toBe(0)
    await env.DB.exec('DROP TRIGGER reject_public_outbox;')
    await createEvent(env, eventRequest)
    const before = await readAtomicManualEvent(env, eventRequest.uuid)
    await env.DB.exec(
      "CREATE TRIGGER reject_public_outbox BEFORE INSERT ON social_post_jobs WHEN NEW.channel='discord' BEGIN SELECT RAISE(ABORT, 'synthetic outbox failure'); END;"
    )
    await expect(
      updateEvent(env, {
        ...eventRequest,
        title: '更新失敗',
        conditions: [{ ...eventRequest.conditions[0], type: 'purchase', purchaseAmount: 500 }]
      })
    ).rejects.toThrow()
    expect(await readAtomicManualEvent(env, eventRequest.uuid)).toEqual(before)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM social_post_jobs').first<number>('n')).toBe(2)
  } finally {
    await mf.dispose()
  }
}, 60000)

test('atomic update preserves field semantics and distinct monotonically increasing versions', async () => {
  const { mf, env } = await database()
  try {
    await createEvent(env, { ...eventRequest, limitedQuantity: 25 })
    const updated = await updateEvent(env, {
      ...eventRequest,
      title: '変更後',
      endDate: undefined,
      characterId: 'secret'
    })
    expect(updated.limitedQuantity).toBe(25)
    expect(updated.endDate).toBeUndefined()
    expect(updated.characterId).toBe('secret')
    expect(updated.conditions[0].uuid).toBe(eventRequest.conditions[0].uuid)
    expect(updated.referenceUrls[0].uuid).toBe(eventRequest.referenceUrls[0].uuid)
    const again = await updateEvent(env, { ...eventRequest, title: '再更新', limitedQuantity: 10 })
    expect(again.updatedAt.getTime()).toBeGreaterThan(updated.updatedAt.getTime())
    expect(again.limitedQuantity).toBe(10)
    expect(again.characterId).toBeUndefined()
    const jobs = await env.DB.prepare(
      "SELECT key,snapshot_json FROM social_post_jobs WHERE channel='x' ORDER BY created_at"
    ).all<{ key: string; snapshot_json: string }>()
    expect(jobs.results).toHaveLength(3)
    expect(new Set(jobs.results.map((job) => job.key)).size).toBe(3)
    const titles = jobs.results.map((job) => {
      const parsed = SocialSnapshotSchema.safeParse(JSON.parse(job.snapshot_json))
      if (!parsed.success) throw new Error('Invalid snapshot')
      const [image] = parsed.data.images
      if (image.type !== 'event') throw new Error('Expected a single event image')
      return image.event.title
    })
    expect(titles).toEqual([eventRequest.title, '変更後', '再更新'])
    const concurrent = await Promise.all([
      updateEvent(env, { ...eventRequest, title: '同時更新A' }),
      updateEvent(env, { ...eventRequest, title: '同時更新B' })
    ])
    expect(new Set(concurrent.map((event) => event.updatedAt.toISOString())).size).toBe(2)
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM social_post_jobs WHERE channel='x'").first<number>('n')
    ).toBe(5)
  } finally {
    await mf.dispose()
  }
}, 60000)

test('private atomic create saves the event and children without either public channel job', async () => {
  const { mf, env } = await database()
  try {
    await createEvent(env, { ...eventRequest, isVerified: false })
    expect(await env.DB.prepare('SELECT count(*) AS n FROM social_post_jobs').first<number>('n')).toBe(0)
    const saved = await readAtomicManualEvent(env, eventRequest.uuid)
    expect(saved.isVerified).toBe(false)
    expect(saved.conditions).toHaveLength(eventRequest.conditions.length)
    expect(saved.stores).toEqual(eventRequest.stores)
  } finally {
    await mf.dispose()
  }
}, 60000)

test('verified preliminary updates create both channel jobs, and queue failure preserves all pending versions', async () => {
  const { mf, env } = await database()
  try {
    await createEvent(env, { ...eventRequest, isVerified: false })
    await updateEvent(env, { ...eventRequest, isPreliminary: true })
    const before = await env.DB.prepare('SELECT id,channel FROM social_post_jobs ORDER BY channel').all<{
      id: string
      channel: string
    }>()
    expect(before.results.map((job) => job.channel)).toEqual(['discord', 'x'])
    expect((await readAtomicManualEvent(env, eventRequest.uuid)).isPreliminary).toBe(true)
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    const attempted: unknown[] = []
    try {
      const queued = Object.assign(env, {
        EVENT_DETECTION_QUEUE: {
          send: async (message: unknown) => {
            attempted.push(message)
            throw new Error('queue unavailable')
          }
        }
      })
      await updateEvent(queued, eventRequest)
      const jobs = await env.DB.prepare(
        "SELECT id,channel,key,snapshot_json FROM social_post_jobs WHERE status='pending'"
      ).all<{ id: string; channel: string; key: string; snapshot_json: string }>()
      expect(jobs.results).toHaveLength(4)
      expect(jobs.results.filter((job) => job.channel === 'x')).toHaveLength(2)
      expect(jobs.results.filter((job) => job.channel === 'discord')).toHaveLength(2)
      expect(before.results.every((job) => jobs.results.some((saved) => saved.id === job.id))).toBe(true)
      expect(attempted).toHaveLength(4)
      expect(errors).toHaveBeenCalled()
      const snapshots = jobs.results.map((job) => {
        const parsed = SocialSnapshotSchema.safeParse(JSON.parse(job.snapshot_json))
        if (!parsed.success) throw new Error('Invalid pending event snapshot')
        return parsed.data
      })
      // 公開状態はスナップショットに持たず送信直前に D1 で確認する。保存されたのは更新2回分の版（キーが2種類）。
      expect(snapshots.every((snapshot) => snapshot.kind === 'updated' && snapshot.images.length === 1)).toBe(true)
      expect(new Set(jobs.results.map((job) => job.key)).size).toBe(2)
      const saved = await readAtomicManualEvent(env, eventRequest.uuid)
      expect(saved.isVerified).toBe(true)
      expect(saved.isPreliminary).toBe(false)
    } finally {
      errors.mockRestore()
    }
  } finally {
    await mf.dispose()
  }
}, 60000)

test('HTTP create/update use atomic outbox once without the old post-save announcement path', async () => {
  const { mf, env } = await database()
  try {
    const response = await routes.request(
      '/',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventRequest) },
      env
    )
    expect(response.status).toBe(201)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM social_post_jobs').first<number>('n')).toBe(2)
    const update = await routes.request(
      `/${eventRequest.uuid}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...eventRequest, title: 'HTTP更新' })
      },
      env
    )
    expect(update.status).toBe(200)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM social_post_jobs').first<number>('n')).toBe(4)
    const replay = await routes.request(
      '/',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventRequest) },
      env
    )
    expect(replay.status).toBe(201)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM social_post_jobs').first<number>('n')).toBe(4)
  } finally {
    await mf.dispose()
  }
}, 60000)
