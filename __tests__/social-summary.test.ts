import { expect, mock, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { recoverSocialSummaries, runSocialSchedule } from '@api/services/social-schedule'
import { recoverableSocialSummarySchedules, reserveSocialSummary } from '@api/services/social-summary'
import type { Bindings } from '@api/types/bindings'
import { buildSummarySnapshot } from '@biccame/shared/domain/social-post'
import { EventSchema } from '@biccame/shared/schemas/event.dto'
import { SocialSnapshotSchema, snapshotEventIds } from '@biccame/shared/social'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { z } from 'zod'

// 2026-10-12 (月) 09:00 JST。月曜なので daily と weekly の両方が作られる。
const scheduledAt = '2026-10-12T00:00:00.000Z'
/** 今日 (JST) に開始し、週内に終わるイベント。 */
const event = (index: number, input: Record<string, unknown> = {}) => {
  const parsed = EventSchema.safeParse({
    uuid: `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`,
    title: `イベント${index}`,
    category: 'limited_card',
    stores: ['akiba'],
    startDate: `2026-10-12T10:${String(index % 60).padStart(2, '0')}:00+09:00`,
    endDate: '2026-10-18T23:59:59+09:00',
    isVerified: true,
    isPreliminary: false,
    createdAt: scheduledAt,
    updatedAt: scheduledAt,
    conditions: [],
    status: 'ongoing',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0,
    ...input
  })
  if (!parsed.success) throw new Error('Invalid fixture')
  return parsed.data
}
/** 今日 (JST) に終了するイベント。 */
const endingEvent = (index: number) =>
  event(index, { title: `終了${index}`, startDate: '2026-10-01T10:00:00+09:00', endDate: '2026-10-12T20:00:00+09:00' })
const none = { starting: [], ending: [] }
const withDatabase = async (run: (env: Bindings) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'social-summary-test',
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
    for (const path of [
      'prisma/migrations/20261011183749_social_post_jobs/migration.sql',
      'prisma/migrations/20261011185140_social_summary_runs/migration.sql',
      'prisma/migrations/20261011185746_social_summary_attempts/migration.sql'
    ]) {
      await env.DB.exec((await readFile(path, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '))
    }
    await run(env)
  } finally {
    await mf.dispose()
  }
}
const readManifest = async (env: Bindings, key = 'weekly:2026-10-12') => {
  const raw = await env.DB.prepare('SELECT manifest_json FROM social_summary_runs WHERE key=?')
    .bind(key)
    .first<string>('manifest_json')
  if (raw === null) throw new Error('Missing manifest')
  const parsed = z.array(SocialSnapshotSchema).safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error('Invalid manifest')
  return parsed.data
}
const runStatus = (env: Bindings, key: string) =>
  env.DB.prepare('SELECT status FROM social_summary_runs WHERE key=?').bind(key).first<string>('status')
const jobCount = (env: Bindings) =>
  env.DB.prepare('SELECT COUNT(*) AS count FROM social_post_jobs').first<number>('count')
const imageTypes = (snapshot: { images: { type: string }[] }) => snapshot.images.map((image) => image.type)

test('a run freezes one post with every image, both channel jobs, and an empty run stays empty on repeated invocation', async () => {
  await withDatabase(async (env) => {
    const events = Array.from({ length: 9 }, (_, index) => event(index + 1))
    await reserveSocialSummary(env, 'weekly', scheduledAt, async () => ({ starting: events, ending: [] }))
    // 同じ run は ready なので、後から内容が変わっても作り直さない。
    await reserveSocialSummary(env, 'weekly', '2026-10-12T01:00:00.000Z', async () => ({
      starting: [event(0), ...events],
      ending: [endingEvent(50)]
    }))
    const manifest = await readManifest(env)
    expect(manifest).toHaveLength(1)
    const [post] = manifest
    expect(post.key).toBe('weekly:2026-10-12')
    expect(post.scheduledAt).toBe(scheduledAt)
    // 開始の画像 2 枚（4 + 4、ほか 1 件）に、0 件側の終了の画像 1 枚。
    expect(imageTypes(post)).toEqual(['summary', 'summary', 'empty'])
    expect(snapshotEventIds(post)).toEqual(events.map((value) => value.uuid))
    expect(post.text.split('\n')[0]).toBe('今週開始 9件・今週終了 0件')
    expect(await jobCount(env)).toBe(2)
    expect(await runStatus(env, 'weekly:2026-10-12')).toBe('ready')
    // 両方 0 件の run はスナップショットを作らず、ready のまま再実行しても投稿は生まれない。
    await reserveSocialSummary(env, 'daily', scheduledAt, async () => none)
    await reserveSocialSummary(env, 'daily', scheduledAt, async () => ({ starting: [event(0)], ending: [] }))
    expect(await readManifest(env, 'daily:2026-10-12')).toEqual([])
    expect(await runStatus(env, 'daily:2026-10-12')).toBe('ready')
    expect(await jobCount(env)).toBe(2)
  })
}, 60000)

test('concurrent different event sets never mix and a lost lease cannot write outbox jobs', async () => {
  await withDatabase(async (env) => {
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const old = reserveSocialSummary(env, 'weekly', scheduledAt, async () => {
      entered.resolve()
      await release.promise
      return { starting: [event(1), event(2), event(3), event(4), event(5)], ending: [] }
    })
    await entered.promise
    await reserveSocialSummary(env, 'weekly', scheduledAt, async () => ({ starting: [event(0)], ending: [] }))
    expect(await jobCount(env)).toBe(0)
    await env.DB.prepare("UPDATE social_summary_runs SET lease_until=0 WHERE kind='weekly'").run()
    await reserveSocialSummary(env, 'weekly', '2026-10-12T01:00:00.000Z', async (fixed) => {
      expect(fixed).toBe(scheduledAt)
      return { starting: [event(9)], ending: [] }
    })
    release.resolve()
    await expect(old).rejects.toThrow('Social summary lease lost')
    const [post] = await readManifest(env)
    expect(snapshotEventIds(post)).toEqual([event(9).uuid])
    expect(await jobCount(env)).toBe(2)
  })
}, 60000)

test('a failure on any channel job rolls back the complete manifest and every channel job', async () => {
  await withDatabase(async (env) => {
    // x の挿入は成功し、2 つ目の discord で失敗する。片方のジョブだけが残ってはならない。
    await env.DB.prepare(
      "CREATE TRIGGER fail_discord_job BEFORE INSERT ON social_post_jobs WHEN NEW.channel='discord' AND NEW.key='weekly:2026-10-12' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;"
    ).run()
    const events = { starting: Array.from({ length: 5 }, (_, index) => event(index)), ending: [] }
    await expect(reserveSocialSummary(env, 'weekly', scheduledAt, async () => events)).rejects.toThrow()
    expect(await jobCount(env)).toBe(0)
    expect(await runStatus(env, 'weekly:2026-10-12')).toBe('preparing')
    await env.DB.exec('DROP TRIGGER fail_discord_job')
    await reserveSocialSummary(env, 'weekly', scheduledAt, async () => events)
    expect(await readManifest(env)).toHaveLength(1)
    expect(await jobCount(env)).toBe(2)
  })
}, 60000)

test('summary recovery is finite, expires old runs, and never repeats daily health checks', async () => {
  await withDatabase(async (env) => {
    for (const attempt of Array.from({ length: 5 }, (_, index) => index)) {
      await expect(
        reserveSocialSummary(env, 'weekly', scheduledAt, async () => {
          throw new Error(`synthetic failure ${attempt}`)
        })
      ).rejects.toThrow()
    }
    await reserveSocialSummary(env, 'weekly', scheduledAt, async () => ({ starting: [event(1)], ending: [] }))
    expect(await runStatus(env, 'weekly:2026-10-12')).toBe('failed')
    expect(
      await env.DB.prepare("SELECT attempts FROM social_summary_runs WHERE kind='weekly'").first<number>('attempts')
    ).toBe(5)
    await expect(
      reserveSocialSummary(env, 'daily', scheduledAt, async () => {
        throw new Error('synthetic abandoned run')
      })
    ).rejects.toThrow()
    await env.DB.prepare("UPDATE social_summary_runs SET created_at=? WHERE kind='daily'")
      .bind(dayjs().subtract(49, 'hour').valueOf())
      .run()
    expect(await recoverableSocialSummarySchedules(env)).toEqual([])
    expect(await runStatus(env, 'daily:2026-10-12')).toBe('expired')
    // 翌日 (火) の daily は、中断されたまま最初の cron 時刻で再実行される。
    const tuesday = '2026-10-13T00:00:00.000Z'
    await expect(
      reserveSocialSummary(env, 'daily', tuesday, async () => {
        throw new Error('synthetic recoverable run')
      })
    ).rejects.toThrow()
    const health = mock(async () => {})
    const recover = mock(async () => {})
    await recoverSocialSummaries(env, {
      starting: async (_env, now) => {
        if (now === undefined) throw new Error('Missing fixed schedule time')
        expect(now.toISOString()).toBe(tuesday)
        return [event(2, { startDate: '2026-10-13T10:00:00+09:00' })]
      },
      ending: async () => [],
      weekStarting: async () => [],
      weekEnding: async () => [],
      reserve: reserveSocialSummary,
      recover,
      health
    })
    expect(health).not.toHaveBeenCalled()
    expect(recover).not.toHaveBeenCalled()
    expect(await readManifest(env, 'daily:2026-10-13')).toHaveLength(1)
    expect(await recoverableSocialSummarySchedules(env)).toEqual([])
  })
}, 60000)

test('a failed daily read does not prevent the Monday weekly post', async () => {
  await withDatabase(async (env) => {
    await runSocialSchedule(env, scheduledAt, {
      starting: async () => {
        throw new Error('synthetic starting failure')
      },
      ending: async () => [endingEvent(1)],
      weekStarting: async (_env, from, until) => {
        expect([from, until]).toEqual(['2026-10-11T15:00:00.000Z', '2026-10-18T15:00:00.000Z'])
        return [event(2)]
      },
      weekEnding: async (_env, from, until) => {
        expect([from, until]).toEqual(['2026-10-11T15:00:00.000Z', '2026-10-18T15:00:00.000Z'])
        return []
      },
      reserve: reserveSocialSummary,
      recover: async () => {},
      health: async () => {}
    })
    const [weeklyPost] = await readManifest(env)
    expect(imageTypes(weeklyPost)).toEqual(['summary', 'empty'])
    expect(await recoverableSocialSummarySchedules(env)).toEqual([scheduledAt])
    await reserveSocialSummary(env, 'daily', '2026-10-12T02:00:00.000Z', async (fixed) => {
      expect(fixed).toBe(scheduledAt)
      return none
    })
    expect(await recoverableSocialSummarySchedules(env)).toEqual([])
    expect(await runStatus(env, 'daily:2026-10-12')).toBe('ready')
    expect(buildSummarySnapshot({ kind: 'daily', scheduledAt, ...none })).toBeNull()
  })
}, 60000)

test('one run per kind: Monday makes a daily and a weekly post, other days only a daily post', async () => {
  await withDatabase(async (env) => {
    const deps = (starting: typeof event) => ({
      starting: async () => [starting(1)],
      ending: async () => [endingEvent(2)],
      weekStarting: async () => [starting(1), starting(3, {})],
      weekEnding: async () => [endingEvent(2)],
      reserve: reserveSocialSummary,
      recover: async () => {},
      health: async () => {}
    })
    await runSocialSchedule(env, scheduledAt, deps(event))
    await runSocialSchedule(env, scheduledAt, deps(event))
    const daily = await readManifest(env, 'daily:2026-10-12')
    const weekly = await readManifest(env, 'weekly:2026-10-12')
    expect(daily).toHaveLength(1)
    expect(weekly).toHaveLength(1)
    // 開始と終了は 1 つの投稿の画像に並ぶ（開始 → 終了）。
    expect(imageTypes(daily[0])).toEqual(['summary', 'summary'])
    expect(daily[0].text.split('\n')[0]).toBe('本日開始 1件・本日最終日 1件')
    expect(weekly[0].text.split('\n')[0]).toBe('今週開始 2件・今週終了 1件')
    // 2 回目の実行では投稿が増えない。投稿ごとに x と discord の 2 ジョブ。
    expect(await jobCount(env)).toBe(4)
    const tuesday = '2026-10-13T00:00:00.000Z'
    await runSocialSchedule(env, tuesday, {
      ...deps(event),
      starting: async () => [event(4, { startDate: '2026-10-13T10:00:00+09:00' })],
      ending: async () => []
    })
    expect(await readManifest(env, 'daily:2026-10-13')).toHaveLength(1)
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM social_summary_runs WHERE kind='weekly'").first<number>(
        'count'
      )
    ).toBe(1)
  })
}, 60000)

test('an event outside the day or week fails the run instead of being posted', async () => {
  await withDatabase(async (env) => {
    await expect(
      reserveSocialSummary(env, 'daily', scheduledAt, async () => ({
        starting: [event(1, { startDate: '2026-10-13T00:00:00+09:00' })],
        ending: []
      }))
    ).rejects.toThrow('outside')
    expect(await jobCount(env)).toBe(0)
    expect(await runStatus(env, 'daily:2026-10-12')).toBe('preparing')
    expect(await recoverableSocialSummarySchedules(env)).toEqual([scheduledAt])
  })
}, 60000)
