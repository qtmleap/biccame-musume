import { expect, mock, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import {
  processSocialJob,
  recoverSocialJobs,
  type SocialDependencies,
  saveSocialSnapshot
} from '@api/services/social-posting'
import { runSocialSchedule, socialDateWindow } from '@api/services/social-schedule'
import type { Bindings } from '@api/types/bindings'
import { buildSummarySnapshot } from '@biccame/shared/domain/social-post'
import { type SocialSnapshot, snapshotEventIds } from '@biccame/shared/social'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { event, snapshot } from './fixtures/social-posting'
import { dailySnapshot } from './fixtures/social-snapshots'

test('JST Monday schedule makes one weekly post with start and end lists, and independent empty posts are skipped', async () => {
  expect(socialDateWindow('2026-10-11T23:59:59Z').monday).toBe(true)
  expect(socialDateWindow('2026-10-11T14:59:59Z').monday).toBe(false)
  expect(
    buildSummarySnapshot({
      kind: 'daily',
      scheduledAt: '2026-10-12T00:00:00Z',
      starting: [event(50, false)],
      ending: []
    })
  ).toBeNull()
  const saved: SocialSnapshot[] = []
  const weekStarting = mock(async (_env: Bindings, _from: string, _until: string) => [event()])
  const weekEnding = mock(async (_env: Bindings, _from: string, _until: string) => [])
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'schedule-test',
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-05-11'
    })
  )
  try {
    const env = Object.assign(await mf.getBindings<Bindings>(), { X_POSTING_ENABLED: 'true' })
    await runSocialSchedule(env, '2026-10-12T00:00:00Z', {
      starting: async () => [],
      ending: async () => [],
      weekStarting,
      weekEnding,
      reserve: async (_env, kind, scheduledAt, load) => {
        const built = buildSummarySnapshot({ kind, scheduledAt, ...(await load(scheduledAt)) })
        if (built !== null) saved.push(built)
      },
      recover: async () => {},
      health: async () => {}
    })
    expect(weekStarting.mock.calls[0]?.slice(1)).toEqual(['2026-10-11T15:00:00.000Z', '2026-10-18T15:00:00.000Z'])
    expect(weekEnding.mock.calls[0]?.slice(1)).toEqual(['2026-10-11T15:00:00.000Z', '2026-10-18T15:00:00.000Z'])
    expect(saved.map((value) => value.kind)).toEqual(['weekly'])
    expect(saved[0].images.map((image) => image.type)).toEqual(['summary', 'empty'])
  } finally {
    await mf.dispose()
  }
})

test('D1 channel dedupe, concurrent delivery, frozen snapshots, finite retries and unknown stop', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-test',
      modules: true,
      script: 'export default { fetch(){return new Response("test")} }',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const bindings = await mf.getBindings<Bindings>()
    await bindings.DB.exec(
      (await readFile('prisma/migrations/20261011183749_social_post_jobs/migration.sql', 'utf8'))
        .replace(/^--.*$/gm, '')
        .replace(/\n/g, ' ')
    )
    await bindings.DB.exec('CREATE TABLE events (id TEXT PRIMARY KEY, is_verified INTEGER, is_preliminary INTEGER);')
    await bindings.DB.prepare('INSERT INTO events VALUES (?, 1, 0)').bind(event().uuid).run()
    const queued: unknown[] = []
    const env = Object.assign(bindings, {
      X_POSTING_ENABLED: 'true',
      DISCORD_POSTING_ENABLED: 'true',
      EVENT_DETECTION_QUEUE: {
        send: async (value: unknown) => {
          queued.push(value)
        }
      }
    })
    await saveSocialSnapshot(env, snapshot('first'))
    await saveSocialSnapshot(env, { ...snapshot('first'), text: 'changed text' })
    const jobs = await env.DB.prepare('SELECT id,channel,snapshot_json FROM social_post_jobs ORDER BY channel').all<{
      id: string
      channel: string
      snapshot_json: string
    }>()
    expect(jobs.results).toHaveLength(2)
    expect(jobs.results.every((job) => !job.snapshot_json.includes('changed text'))).toBe(true)
    const sent: string[] = []
    const deps: SocialDependencies = {
      render: async () => new Uint8Array([1]),
      send: async (_env, channel) => {
        sent.push(channel)
        return { status: 'sent', id: channel }
      }
    }
    await Promise.all([
      processSocialJob(env, jobs.results[0].id, deps),
      processSocialJob(env, jobs.results[0].id, deps)
    ])
    expect(sent).toEqual(['discord'])
    const unknown: SocialDependencies = { ...deps, send: async () => ({ status: 'unknown', kind: 'delivery_unknown' }) }
    await processSocialJob(env, jobs.results[1].id, unknown)
    await processSocialJob(env, jobs.results[1].id, deps)
    expect(sent).toEqual(['discord'])
    queued.splice(0)
    await recoverSocialJobs(env)
    expect(queued).toHaveLength(0)
    await saveSocialSnapshot(env, snapshot('retry'))
    const retryJob = await env.DB.prepare(
      "SELECT id FROM social_post_jobs WHERE key='retry' AND channel='x'"
    ).first<string>('id')
    if (retryJob === null) throw new Error('Missing retry fixture')
    const limited: SocialDependencies = {
      ...deps,
      send: async () => ({ status: 'failed', kind: 'rate_limit', retry: 2 })
    }
    for (const index of Array.from({ length: 5 }, (_, value) => value)) {
      await env.DB.prepare('UPDATE social_post_jobs SET available_at=0 WHERE id=?').bind(retryJob).run()
      expect(await processSocialJob(env, retryJob, limited)).toBe(index === 4 ? null : 2)
    }
    expect(
      await env.DB.prepare('SELECT status FROM social_post_jobs WHERE id=?').bind(retryJob).first<string>('status')
    ).toBe('failed')
    await saveSocialSnapshot(env, snapshot('image'))
    const imageJob = await env.DB.prepare(
      "SELECT id FROM social_post_jobs WHERE key='image' AND channel='x'"
    ).first<string>('id')
    if (imageJob === null) throw new Error('Missing image fixture')
    const noImage: SocialDependencies = {
      ...deps,
      render: async () => {
        throw new Error('render failed')
      }
    }
    expect(await processSocialJob(env, imageJob, noImage)).toBeGreaterThan(0)
    expect(sent).toEqual(['discord'])
    await env.DB.prepare(
      "UPDATE social_post_jobs SET status='unknown',lease_until=?,last_error='delivery_in_progress' WHERE id=?"
    )
      .bind(dayjs().valueOf() - 1, imageJob)
      .run()
    await processSocialJob(env, imageJob, deps)
    expect(sent).toEqual(['discord'])
    await saveSocialSnapshot(env, snapshot('disabled'))
    const disabledJob = await env.DB.prepare(
      "SELECT id FROM social_post_jobs WHERE key='disabled' AND channel='x'"
    ).first<string>('id')
    if (disabledJob === null) throw new Error('Missing disabled fixture')
    await processSocialJob({ ...env, X_POSTING_ENABLED: 'false' }, disabledJob, deps)
    expect(
      await env.DB.prepare('SELECT status FROM social_post_jobs WHERE id=?').bind(disabledJob).first<string>('status')
    ).toBe('skipped')
  } finally {
    await mf.dispose()
  }
}, 60000)

test('a multi-image job renders every image in order, sends them together once per channel, and a render failure sends nothing', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-multi-image-test',
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
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
    const four: SocialSnapshot = { ...dailySnapshot(8, 8), key: 'multi' }
    await env.DB.batch(snapshotEventIds(four).map((id) => env.DB.prepare('INSERT INTO events VALUES (?,1,0)').bind(id)))
    await saveSocialSnapshot(env, four)
    const jobs = await env.DB.prepare('SELECT id,channel FROM social_post_jobs WHERE key=? ORDER BY channel')
      .bind('multi')
      .all<{ id: string; channel: 'x' | 'discord' }>()
    expect(jobs.results.map((job) => job.channel)).toEqual(['discord', 'x'])
    const status = async (id: string) =>
      env.DB.prepare('SELECT status,last_error,delivery_id,attempts FROM social_post_jobs WHERE id=?')
        .bind(id)
        .first<{ status: string; last_error: string | null; delivery_id: string | null; attempts: number }>()
    const sent: { channel: string; bytes: number[]; nonce: string }[] = []
    const rendered: number[] = []
    const deps: SocialDependencies = {
      render: async (_env, saved, index) => {
        expect(saved.images).toHaveLength(4)
        rendered.push(index)
        return new Uint8Array([index])
      },
      send: async (_env, channel, _saved, pngs, nonce) => {
        sent.push({ channel, bytes: pngs.map((png) => png[0]), nonce })
        return { status: 'sent', id: `${channel}-1` }
      }
    }
    for (const job of jobs.results) await processSocialJob(env, job.id, deps)
    // 投稿単位のジョブ: 描画は各チャネルで0..3の順に1回ずつ、送信はチャネルごとに1回。
    expect(rendered).toEqual([0, 1, 2, 3, 0, 1, 2, 3])
    expect(sent.map((value) => [value.channel, value.bytes])).toEqual([
      ['discord', [0, 1, 2, 3]],
      ['x', [0, 1, 2, 3]]
    ])
    expect(sent.every((value) => value.nonce.length === 24)).toBe(true)
    expect(await Promise.all(jobs.results.map((job) => status(job.id)))).toEqual([
      { status: 'sent', last_error: null, delivery_id: 'discord-1', attempts: 1 },
      { status: 'sent', last_error: null, delivery_id: 'x-1', attempts: 1 }
    ])

    // 2枚目の描画が失敗したら、送信も配信開始の記録（unknown）もせず、投稿全体を再試行に回す。
    await saveSocialSnapshot(env, { ...four, key: 'render-fails' })
    const failing = await env.DB.prepare(
      "SELECT id FROM social_post_jobs WHERE key='render-fails' AND channel='x'"
    ).first<{
      id: string
    }>()
    if (failing === null) throw new Error('Missing render failure fixture')
    sent.splice(0)
    const calls: number[] = []
    const delay = await processSocialJob(env, failing.id, {
      ...deps,
      render: async (_env, _saved, index) => {
        calls.push(index)
        if (index === 1) throw new Error('render failed')
        return new Uint8Array([index])
      }
    })
    expect(delay).toBeGreaterThan(0)
    expect(calls).toEqual([0, 1])
    expect(sent).toHaveLength(0)
    expect(await status(failing.id)).toMatchObject({ status: 'pending', last_error: 'image_failed', attempts: 1 })
    // 再試行では全画像を描き直して1回で送る。
    await env.DB.prepare('UPDATE social_post_jobs SET available_at=0 WHERE id=?').bind(failing.id).run()
    rendered.splice(0)
    await processSocialJob(env, failing.id, deps)
    expect(rendered).toEqual([0, 1, 2, 3])
    expect(sent).toHaveLength(1)
    expect(await status(failing.id)).toMatchObject({ status: 'sent', attempts: 2 })
  } finally {
    await mf.dispose()
  }
}, 60000)
