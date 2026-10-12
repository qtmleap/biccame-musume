import { expect, mock, spyOn, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { eventSocialSnapshot } from '@api/services/bot-announcement'
import { postDiscordImages } from '@api/services/discord'
import {
  processSocialJob,
  recoverSocialJobs,
  type SocialDependencies,
  saveSocialSnapshot,
  sendSocialPost
} from '@api/services/social-posting'
import { runSocialSchedule, socialDateWindow } from '@api/services/social-schedule'
import type { Bindings } from '@api/types/bindings'
import { buildSummarySnapshot } from '@biccame/shared/domain/social-post'
import { EventDetailSchema } from '@biccame/shared/schemas/event.dto'
import { type SocialSnapshot, snapshotEventIds } from '@biccame/shared/social'
import { TwitterTransport } from '@biccame/shared/x/transport'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { dailySnapshot } from './fixtures/social-snapshots'

const event = (index = 0, verified = true) => {
  const parsed = EventDetailSchema.safeParse({
    uuid: `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`,
    title: 'テスト配布',
    category: 'limited_card',
    stores: ['akiba'],
    startDate: '2026-10-12T00:00:00+09:00',
    endDate: '2026-10-18T23:59:59+09:00',
    isVerified: verified,
    isPreliminary: false,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    conditions: [],
    referenceUrls: [],
    comments: [],
    status: 'ongoing',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0
  })
  if (!parsed.success) throw new Error('Invalid fixture')
  return parsed.data
}
const snapshot = (key: string): SocialSnapshot => ({ ...eventSocialSnapshot(event(), 'created'), key })

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

const discordEnv = { DISCORD_TOKEN: 'synthetic', DISCORD_CHANNEL_ID: '12345' }

test('Discord multipart attaches every PNG to one message with matching attachments; never falls back to text', async () => {
  const calls: RequestInit[] = []
  const response = await postDiscordImages(
    discordEnv,
    '@everyone event',
    [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6]), new Uint8Array([7])],
    'test-nonce',
    async (_url, init) => {
      calls.push(init)
      return new Response(JSON.stringify({ id: '123' }))
    }
  )
  expect(response).toEqual({ status: 'sent', messageId: '123' })
  expect(calls).toHaveLength(1)
  const form = calls[0].body
  if (!(form instanceof FormData)) throw new Error('Expected multipart')
  const payload = JSON.parse(String(form.get('payload_json')))
  expect(payload).toMatchObject({ allowed_mentions: { parse: [] }, enforce_nonce: true, nonce: 'test-nonce' })
  const filenames = [0, 1, 2, 3].map((index) => `event-${index + 1}.png`)
  expect(payload.attachments).toEqual(filenames.map((filename, id) => ({ id, filename })))
  for (const [index, filename] of filenames.entries()) {
    const file = form.get(`files[${index}]`)
    expect(file instanceof File && [file.type, file.name]).toEqual(['image/png', filename])
  }
  expect(form.get('files[4]')).toBeNull()
  const sizes = await Promise.all(
    [0, 1, 2, 3].map(async (index) => {
      const file = form.get(`files[${index}]`)
      return file instanceof Blob ? (await file.arrayBuffer()).byteLength : -1
    })
  )
  expect(sizes).toEqual([2, 1, 3, 1])
  // 画像なしの送信、5xx（受理済みかもしれない）は再送しない。
  const never = async () => {
    throw new Error('transport must not be called')
  }
  expect(await postDiscordImages(discordEnv, 'event', [], 'nonce', never)).toEqual({
    status: 'failed',
    kind: 'invalid_input'
  })
  expect(
    await postDiscordImages(
      discordEnv,
      'event',
      [new Uint8Array([1])],
      'nonce',
      async () => new Response('{}', { status: 500 })
    )
  ).toEqual({ status: 'unknown', kind: 'delivery_unknown' })
  expect(await postDiscordImages({}, 'event', [new Uint8Array([1])], 'nonce', never)).toEqual({
    status: 'failed',
    kind: 'configuration'
  })
})

test('X authentication/upload precede one tweet carrying every media id; known pre-send errors retry, unknown tweets stop', async () => {
  const auth = spyOn(TwitterTransport.prototype, 'checkAuthenticatedSession').mockResolvedValue()
  const active = { current: 0, max: 0 }
  const order: string[] = []
  const upload = spyOn(TwitterTransport.prototype, 'uploadImage').mockImplementation(async (png) => {
    active.current += 1
    active.max = Math.max(active.max, active.current)
    // 並列に呼ばれた場合に重なりが観測できるよう、1回待つ。
    await Promise.resolve()
    await Promise.resolve()
    active.current -= 1
    order.push(`upload:${png[0]}`)
    return `media-${png[0]}`
  })
  const tweet = spyOn(TwitterTransport.prototype, 'tweet').mockImplementation(async () => {
    order.push('tweet')
    return '67890'
  })
  const env = { TWITTER_AUTH_TOKEN: 'synthetic', TWITTER_CSRF_TOKEN: 'synthetic' }
  const four = dailySnapshot(8, 8)
  expect(four.images).toHaveLength(4)
  const pngs = four.images.map((_, index) => new Uint8Array([index + 1]))
  try {
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({ status: 'sent', id: '67890' })
    expect(auth).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledTimes(4)
    expect(tweet).toHaveBeenCalledTimes(1)
    // upload は画像の順に直列で、全部終わってから tweet を1回だけ送る。
    expect(active.max).toBe(1)
    expect(order).toEqual(['upload:1', 'upload:2', 'upload:3', 'upload:4', 'tweet'])
    expect(tweet.mock.calls[0]?.[0]).toBe(four.text)
    expect(tweet.mock.calls[0]?.[1]?.mediaIds).toEqual(['media-1', 'media-2', 'media-3', 'media-4'])
    // 1枚の投稿は media 1つ。引用元はそのまま渡る。
    const single: SocialSnapshot = { ...snapshot('single'), quoteTweetId: '123' }
    tweet.mockClear()
    expect(await sendSocialPost(env, 'x', single, [new Uint8Array([9])], 'nonce')).toEqual({
      status: 'sent',
      id: '67890'
    })
    expect(tweet.mock.calls[0]?.[1]).toEqual({ mediaIds: ['media-9'], quoteTweetId: '123' })
    // 3枚目の upload が失敗したら tweet は送らず、再試行できる失敗にする。
    tweet.mockClear()
    upload.mockClear()
    upload.mockResolvedValueOnce('media-1').mockResolvedValueOnce('media-2').mockRejectedValueOnce(new Error('upload'))
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({
      status: 'failed',
      kind: 'media_preparation_failed',
      retry: 60
    })
    expect(upload).toHaveBeenCalledTimes(3)
    expect(tweet).not.toHaveBeenCalled()
    // 認証失敗は upload もしない。
    upload.mockClear()
    auth.mockRejectedValueOnce(new Error('identity mismatch'))
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toMatchObject({ status: 'failed', retry: 60 })
    expect(upload).not.toHaveBeenCalled()
    expect(tweet).not.toHaveBeenCalled()
    // 画像の枚数が合わない、または空なら、画像なしで公開せず再試行もしない。
    for (const wrong of [[], pngs.slice(0, 3), [...pngs, new Uint8Array([5])]]) {
      expect(await sendSocialPost(env, 'x', four, wrong, 'nonce')).toEqual({ status: 'failed', kind: 'invalid_images' })
      expect(await sendSocialPost(env, 'discord', four, wrong, 'nonce')).toEqual({
        status: 'failed',
        kind: 'invalid_images'
      })
    }
    expect(upload).not.toHaveBeenCalled()
    expect(tweet).not.toHaveBeenCalled()
    // tweet 送信後の失敗: rate_limit は再試行、rejected は失敗、それ以外は unknown。
    tweet.mockRejectedValueOnce({ kind: 'rate_limit' })
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({
      status: 'failed',
      kind: 'rate_limit',
      retry: 60
    })
    tweet.mockRejectedValueOnce({ kind: 'rejected' })
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({ status: 'failed', kind: 'rejected' })
    tweet.mockRejectedValueOnce({ kind: 'delivery_unknown' })
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({
      status: 'unknown',
      kind: 'delivery_unknown'
    })
    tweet.mockRejectedValueOnce(new Error('network'))
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({
      status: 'unknown',
      kind: 'delivery_unknown'
    })
  } finally {
    auth.mockRestore()
    upload.mockRestore()
    tweet.mockRestore()
  }
})

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
