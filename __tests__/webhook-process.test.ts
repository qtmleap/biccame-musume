import { expect, spyOn, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import botRoutes from '@api/routes/admin-bot'
import * as discordService from '@api/services/discord'
import * as eventService from '@api/services/event-service'
import { resolveWebhookJob, retryWebhookJob } from '@api/services/webhook-admin'
import { EVENT_DETECTION_MODEL_KEY } from '@api/services/webhook-config'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import { resolveFieldThresholds } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { EventDetailSchema } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import {
  forbidRealFetch,
  mockAi,
  processWebhookJob,
  responseFor,
  TITLE_BASE_URL,
  TITLE_TOKEN
} from './fixtures/webhook-process'

test('queue registration is idempotent and a notification retry does not rerun AI', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-process-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB'],
      kvNamespaces: ['BICCAME_MUSUME_EVENTS']
    })
  )
  const notified: string[] = []
  const delivery = { mode: 'sent' }
  // Clef の呼び出しは ai.clefCalls、タイトル用の呼び出しは ai.titles に分けて記録される
  const ai = mockAi((request) => {
    if (delivery.mode === 'ai_failure') throw new Error('synthetic AI failure')
    return responseFor(request)
  })
  const getEventSpy = spyOn(eventService, 'getEvent').mockImplementation(async (_env, id) => {
    const parsed = EventDetailSchema.safeParse({
      uuid: id,
      category: 'limited_card',
      title: 'テスト配布',
      stores: ['akiba'],
      characterIds: ['akiba'],
      startDate: '2026-10-11T00:00:00Z',
      isVerified: true,
      isPreliminary: false,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
      conditions: [],
      referenceUrls: [],
      comments: [],
      status: 'ongoing',
      daysUntil: 0,
      interestedCount: 0,
      completedCount: 0
    })
    if (!parsed.success) throw new Error('Invalid test event')
    return parsed.data
  })
  const fetchGuard = forbidRealFetch()
  const notificationSpy = spyOn(discordService, 'notifyEventDetection').mockImplementation(async (_env, input) => {
    notified.push(input.postId)
    if (delivery.mode === 'unknown') throw new Error('synthetic response lost')
    if (delivery.mode === 'rate_limit') return { status: 'failed', kind: 'rate_limit', retryAfterSeconds: 1 }
    return { status: 'sent', messageId: '1234567890' }
  })
  try {
    const environment = await mf.getBindings<Bindings>()
    const env = Object.assign(environment, {
      ENVIRONMENT: 'local',
      EVENT_DETECTION_QUEUE: { send: async () => {} },
      ANTHROPIC_BASE_URL: TITLE_BASE_URL,
      ANTHROPIC_AUTH_TOKEN: TITLE_TOKEN,
      AI: { run: ai.run }
    })
    // タイトルの通信はモックの fetcher に向ける（実通信はしない）
    const proceed = (id: string) => processWebhookJob(env, id, { titleFetcher: ai.fetcher })
    const DB = env.DB
    const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations)
      await DB.exec(
        (await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ')
      )
    const post: DetectPost = {
      id: '2109221721773576390',
      screenName: 'bic_akiba',
      text: '10月11日より限定名刺をどなたでも配布します',
      createdAt: '2026-10-11T00:00:00Z',
      kind: 'original',
      url: 'https://x.com/bic_akiba/status/2109221721773576390',
      media: []
    }
    const savedModel = await botRoutes.request(
      '/admin/bot/configuration',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'clef-flash',
          thresholds: { eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.9 },
          fieldThresholds: resolveFieldThresholds(0.9)
        })
      },
      env
    )
    expect(savedModel.status).toBe(200)
    await insertWebhookJob(env, post)
    expect(await proceed(post.id)).toBeNull()
    const job = await getWebhookJob(env, post.id)
    expect(ai.clefCalls.map((call) => call.model)).toEqual(['@cf/cloudflare/clef-flash'])
    expect(job.model).toBe('clef-flash')
    expect(job.status).toBe('registered')
    expect(job.notificationStatus).toBe('sent')
    expect(job.notificationId).toBe('1234567890')
    // 自動登録されたイベントのタイトルは AI が付けた題になり、判定理由に情報用のコードが残る（候補にも同じ題が入る）
    expect(ai.titles).toHaveLength(1)
    expect(await DB.prepare('SELECT title FROM events').first<string>('title')).toBe('ハロウィン名刺')
    expect(job.candidate?.title).toBe('ハロウィン名刺')
    expect(job.reasons).toContain('title_generated')
    expect(job.reasons).not.toContain('title_fallback')
    expect(ai.clefCalls).toHaveLength(1)
    expect(notified).toHaveLength(1)
    expect(await proceed(post.id)).toBeNull()
    expect(ai.clefCalls).toHaveLength(1)
    expect(notified).toHaveLength(1)
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, 'clef')
    const getModelSpy = spyOn(env.BICCAME_MUSUME_EVENTS, 'get').mockImplementation(async () => {
      throw new Error('KV must not be read for notification retry')
    })
    await DB.prepare("UPDATE webhook_event_candidates SET notification_status='pending' WHERE post_id=?")
      .bind(post.id)
      .run()
    await DB.prepare("UPDATE webhook_event_jobs SET notification_status='pending' WHERE post_id=?").bind(post.id).run()
    await proceed(post.id)
    expect(ai.clefCalls).toHaveLength(1)
    expect(notified).toHaveLength(2)
    expect(getModelSpy).not.toHaveBeenCalled()
    getModelSpy.mockRestore()
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    delivery.mode = 'unknown'
    const duplicate = { ...post, id: '2109221721773576391', url: 'https://x.com/bic_akiba/status/2109221721773576391' }
    await insertWebhookJob(env, duplicate)
    await proceed(duplicate.id)
    const held = await getWebhookJob(env, duplicate.id)
    expect(held.status).toBe('held')
    expect(held.reasons.some((reason) => reason.startsWith('possible_duplicate:'))).toBe(true)
    // 重複で保留になる候補にも題が付く（人が補完して登録するときの初期値になる）
    expect(held.candidate?.title).toBe('ハロウィン名刺')
    expect(held.reasons).toContain('title_generated')
    expect(held.notificationStatus).toBe('unknown')
    const sentBefore = notified.length
    expect(await proceed(duplicate.id)).toBeNull()
    expect(notified).toHaveLength(sentBefore)
    delivery.mode = 'rate_limit'
    const limited = { ...post, id: '2109221721773576392', url: 'https://x.com/bic_akiba/status/2109221721773576392' }
    await insertWebhookJob(env, limited)
    expect(await proceed(limited.id)).toBe(1)
    expect((await getWebhookJob(env, limited.id)).notificationStatus).toBe('pending')
    const aiBefore = ai.clefCalls.length
    delivery.mode = 'sent'
    await proceed(limited.id)
    expect(ai.clefCalls).toHaveLength(aiBefore)
    expect((await getWebhookJob(env, limited.id)).notificationStatus).toBe('sent')
    await DB.prepare(
      "UPDATE webhook_event_jobs SET notification_status='pending',lease_token='synthetic-other-worker',lease_until=? WHERE post_id=?"
    )
      .bind(dayjs().valueOf() + 100000, limited.id)
      .run()
    expect(await proceed(limited.id)).toBeGreaterThanOrEqual(100)
    await DB.prepare('UPDATE webhook_event_jobs SET lease_until=? WHERE post_id=?')
      .bind(dayjs().valueOf() - 1, limited.id)
      .run()
    expect(await proceed(limited.id)).toBeNull()
    // タイトルの通信は、登録した投稿（1 回）と、重複で保留になった 2 件の投稿（各 1 回）。通知の再送では呼ばない
    expect(ai.titles).toHaveLength(3)
    await expect(retryWebhookJob(env, duplicate.id, { notificationOnly: true, allowUnknown: false })).rejects.toThrow(
      'explicit confirmation'
    )
    await retryWebhookJob(env, duplicate.id, { notificationOnly: true, allowUnknown: true })
    const aiBeforeRetry = ai.clefCalls.length
    await proceed(duplicate.id)
    expect(ai.clefCalls).toHaveLength(aiBeforeRetry)
    if (job.eventId === null || job.candidate === null) throw new Error('Registered fixture missing event')
    await resolveWebhookJob(env, duplicate.id, { action: 'link', eventId: job.eventId })
    await proceed(duplicate.id)
    expect((await getWebhookJob(env, duplicate.id)).eventId).toBe(job.eventId)
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    expect(await DB.prepare('SELECT count(*) AS total FROM event_reference_urls').first<number>('total')).toBe(2)
    await resolveWebhookJob(env, limited.id, { action: 'reject' })
    const rejected = await getWebhookJob(env, limited.id)
    expect(rejected.status).toBe('ignored')
    expect(rejected.notificationStatus).toBe('skipped')
    const incomplete = {
      ...post,
      id: '2109221721773576393',
      url: 'https://x.com/bic_akiba/status/2109221721773576393',
      text: '限定名刺をどなたでも配布します'
    }
    await insertWebhookJob(env, incomplete)
    await proceed(incomplete.id)
    const incompleteJob = await getWebhookJob(env, incomplete.id)
    expect(incompleteJob.status).toBe('held')
    const manual = {
      ...job.candidate,
      uuid: incompleteJob.eventUUID,
      conditions: job.candidate.conditions.map((condition) => ({ ...condition, uuid: crypto.randomUUID() })),
      referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce' as const, url: incomplete.url }]
    }
    await resolveWebhookJob(env, incomplete.id, { action: 'register', event: manual })
    await proceed(incomplete.id)
    expect((await getWebhookJob(env, incomplete.id)).status).toBe('registered')
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(2)
    // 登録候補の無い保留・手動の登録・紐付け・対象外・通知の再送・保存済みの判定の再利用では、タイトル用の呼び出しは増えない（上の 3 回のまま）
    expect(ai.titles).toHaveLength(3)
    delivery.mode = 'ai_failure'
    const failedPost = { ...post, id: '2109221721773576394', url: 'https://x.com/bic_akiba/status/2109221721773576394' }
    await insertWebhookJob(env, failedPost)
    await expect(proceed(failedPost.id)).rejects.toThrow('synthetic AI failure')
    expect((await getWebhookJob(env, failedPost.id)).status).toBe('failed')
    // 旧: 'processing_failed' と完全一致。新: 接頭辞・段階（Clef の判定）・例外名だけで、例外のメッセージは含めない。
    const failedError = (await getWebhookJob(env, failedPost.id)).lastError
    expect(failedError).toBe('processing_failed:detection:Error')
    expect(failedError).not.toContain('synthetic AI failure')
    delivery.mode = 'sent'
    await retryWebhookJob(env, failedPost.id, { notificationOnly: false, allowUnknown: false })
    await proceed(failedPost.id)
    expect((await getWebhookJob(env, failedPost.id)).status).toBe('held')
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(2)
    await DB.prepare("UPDATE webhook_event_candidates SET status='failed' WHERE post_id=?").bind(failedPost.id).run()
    await retryWebhookJob(env, failedPost.id, { notificationOnly: false, allowUnknown: false })
    const cachedCalls = ai.clefCalls.length
    const titlesBeforeReuse = ai.titles.length
    const cachedModel = (await getWebhookJob(env, failedPost.id)).model
    const cachedGet = spyOn(env.BICCAME_MUSUME_EVENTS, 'get').mockImplementation(async () => {
      throw new Error('KV must not be read for saved result retry')
    })
    try {
      await proceed(failedPost.id)
      expect(ai.clefCalls).toHaveLength(cachedCalls)
      expect(cachedGet).not.toHaveBeenCalled()
      expect((await getWebhookJob(env, failedPost.id)).model).toBe(cachedModel)
      // 保存済みの判定を再利用しても、登録候補のある保留は題をもう一度付ける（Clef は呼ばない）。1 回だけで再試行はしない
      expect(ai.titles).toHaveLength(titlesBeforeReuse + 1)
    } finally {
      cachedGet.mockRestore()
    }
  } finally {
    fetchGuard.mockRestore()
    notificationSpy.mockRestore()
    getEventSpy.mockRestore()
    await mf.dispose()
  }
}, 60000)
