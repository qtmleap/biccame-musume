import { expect, spyOn, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import botRoutes from '@api/routes/admin-bot'
import * as eventService from '@api/services/event-service'
import { resolveWebhookJob, retryWebhookJob } from '@api/services/webhook-admin'
import { EVENT_DETECTION_MODEL_KEY } from '@api/services/webhook-config'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import type { Bindings } from '@api/types/bindings'
import type { ClefAnswer, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { EventDetailSchema } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const responseFor = (request: ClefRequest): ClefResponse => {
  const desired: Record<string, string> = {
    status: 'start',
    category: 'limited_card',
    store: 'akiba',
    condition: 'everyone',
    end_date: 'none',
    quantity: 'none'
  }
  const answers: Record<string, ClefAnswer> = Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      if (question.type === 'noul') return [id, { type: 'noul' as const, noul: 0.99 }]
      if (question.type === 'score') return [id, { type: 'score' as const, score: 1, confidence: 0.99 }]
      const choices = Object.keys(question.criteria)
      const choice = desired[id] ? desired[id] : choices.find((key) => key !== 'none')
      if (!choice) throw new Error('No test choice')
      return [
        id,
        {
          type: 'choice' as const,
          choice,
          probabilities: Object.fromEntries(
            choices.map((key) => [key, key === choice ? 0.99 : 0.01 / (choices.length - 1)])
          )
        }
      ]
    })
  )
  return { answers }
}

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
  const aiCalls: string[] = []
  const aiModels: string[] = []
  const notified: string[] = []
  const delivery = { mode: 'sent' }
  const getEventSpy = spyOn(eventService, 'getEvent').mockImplementation(async (_env, id) => {
    const parsed = EventDetailSchema.safeParse({
      uuid: id,
      category: 'limited_card',
      title: 'テスト配布',
      stores: ['akiba'],
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
  try {
    const environment = await mf.getBindings<Bindings>()
    const env = Object.assign(environment, {
      ENVIRONMENT: 'local',
      EVENT_DETECTION_QUEUE: { send: async () => {} },
      AI: {
        run: async (_model: string, request: ClefRequest) => {
          aiCalls.push(request.state)
          aiModels.push(_model)
          if (delivery.mode === 'ai_failure') throw new Error('synthetic AI failure')
          return responseFor(request)
        }
      },
      BOT: {
        notifyEventDetection: async (input: { postId: string }) => {
          notified.push(input.postId)
          if (delivery.mode === 'unknown') throw new Error('synthetic RPC response lost')
          if (delivery.mode === 'rate_limit') return { status: 'failed', kind: 'rate_limit', retryAfterSeconds: 1 }
          return { status: 'sent', messageId: '1234567890' }
        }
      }
    })
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
        body: JSON.stringify({ model: 'clef-flash' })
      },
      env
    )
    expect(savedModel.status).toBe(200)
    await insertWebhookJob(env, post)
    expect(await processWebhookJob(env, post.id)).toBeNull()
    const job = await getWebhookJob(env, post.id)
    expect(aiModels).toEqual(['@cf/cloudflare/clef-flash'])
    expect(job.model).toBe('clef-flash')
    expect(job.status).toBe('registered')
    expect(job.notificationStatus).toBe('sent')
    expect(job.notificationId).toBe('1234567890')
    expect(aiCalls).toHaveLength(1)
    expect(notified).toHaveLength(1)
    expect(await processWebhookJob(env, post.id)).toBeNull()
    expect(aiCalls).toHaveLength(1)
    expect(notified).toHaveLength(1)
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, 'clef')
    const getModelSpy = spyOn(env.BICCAME_MUSUME_EVENTS, 'get').mockImplementation(async () => {
      throw new Error('KV must not be read for notification retry')
    })
    await DB.prepare("UPDATE webhook_event_jobs SET notification_status='pending' WHERE post_id=?").bind(post.id).run()
    await processWebhookJob(env, post.id)
    expect(aiCalls).toHaveLength(1)
    expect(notified).toHaveLength(2)
    expect(getModelSpy).not.toHaveBeenCalled()
    getModelSpy.mockRestore()
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    delivery.mode = 'unknown'
    const duplicate = { ...post, id: '2109221721773576391', url: 'https://x.com/bic_akiba/status/2109221721773576391' }
    await insertWebhookJob(env, duplicate)
    await processWebhookJob(env, duplicate.id)
    const held = await getWebhookJob(env, duplicate.id)
    expect(held.status).toBe('held')
    expect(held.reasons.some((reason) => reason.startsWith('possible_duplicate:'))).toBe(true)
    expect(held.notificationStatus).toBe('unknown')
    const sentBefore = notified.length
    expect(await processWebhookJob(env, duplicate.id)).toBeNull()
    expect(notified).toHaveLength(sentBefore)
    delivery.mode = 'rate_limit'
    const limited = { ...post, id: '2109221721773576392', url: 'https://x.com/bic_akiba/status/2109221721773576392' }
    await insertWebhookJob(env, limited)
    expect(await processWebhookJob(env, limited.id)).toBe(1)
    expect((await getWebhookJob(env, limited.id)).notificationStatus).toBe('pending')
    const aiBefore = aiCalls.length
    delivery.mode = 'sent'
    await processWebhookJob(env, limited.id)
    expect(aiCalls).toHaveLength(aiBefore)
    expect((await getWebhookJob(env, limited.id)).notificationStatus).toBe('sent')
    await DB.prepare(
      "UPDATE webhook_event_jobs SET notification_status='pending',lease_token='synthetic-other-worker',lease_until=? WHERE post_id=?"
    )
      .bind(dayjs().valueOf() + 100000, limited.id)
      .run()
    expect(await processWebhookJob(env, limited.id)).toBeGreaterThanOrEqual(100)
    await DB.prepare('UPDATE webhook_event_jobs SET lease_until=? WHERE post_id=?')
      .bind(dayjs().valueOf() - 1, limited.id)
      .run()
    expect(await processWebhookJob(env, limited.id)).toBeNull()
    await expect(retryWebhookJob(env, duplicate.id, { notificationOnly: true, allowUnknown: false })).rejects.toThrow(
      'explicit confirmation'
    )
    await retryWebhookJob(env, duplicate.id, { notificationOnly: true, allowUnknown: true })
    const aiBeforeRetry = aiCalls.length
    await processWebhookJob(env, duplicate.id)
    expect(aiCalls).toHaveLength(aiBeforeRetry)
    if (job.eventId === null || job.candidate === null) throw new Error('Registered fixture missing event')
    await resolveWebhookJob(env, duplicate.id, { action: 'link', eventId: job.eventId })
    await processWebhookJob(env, duplicate.id)
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
    await processWebhookJob(env, incomplete.id)
    const incompleteJob = await getWebhookJob(env, incomplete.id)
    expect(incompleteJob.status).toBe('held')
    const manual = {
      ...job.candidate,
      uuid: incompleteJob.eventUUID,
      conditions: job.candidate.conditions.map((condition) => ({ ...condition, uuid: crypto.randomUUID() })),
      referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce' as const, url: incomplete.url }]
    }
    await resolveWebhookJob(env, incomplete.id, { action: 'register', event: manual })
    await processWebhookJob(env, incomplete.id)
    expect((await getWebhookJob(env, incomplete.id)).status).toBe('registered')
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(2)
    delivery.mode = 'ai_failure'
    const failedPost = { ...post, id: '2109221721773576394', url: 'https://x.com/bic_akiba/status/2109221721773576394' }
    await insertWebhookJob(env, failedPost)
    await expect(processWebhookJob(env, failedPost.id)).rejects.toThrow('synthetic AI failure')
    expect((await getWebhookJob(env, failedPost.id)).status).toBe('failed')
    expect((await getWebhookJob(env, failedPost.id)).lastError).toBe('processing_failed')
    delivery.mode = 'sent'
    await retryWebhookJob(env, failedPost.id, { notificationOnly: false, allowUnknown: false })
    await processWebhookJob(env, failedPost.id)
    expect((await getWebhookJob(env, failedPost.id)).status).toBe('held')
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(2)
    await DB.prepare("UPDATE webhook_event_jobs SET status='failed' WHERE post_id=?").bind(failedPost.id).run()
    await retryWebhookJob(env, failedPost.id, { notificationOnly: false, allowUnknown: false })
    const cachedCalls = aiCalls.length
    const cachedModel = (await getWebhookJob(env, failedPost.id)).model
    const cachedGet = spyOn(env.BICCAME_MUSUME_EVENTS, 'get').mockImplementation(async () => {
      throw new Error('KV must not be read for saved result retry')
    })
    try {
      await processWebhookJob(env, failedPost.id)
      expect(aiCalls).toHaveLength(cachedCalls)
      expect(cachedGet).not.toHaveBeenCalled()
      expect((await getWebhookJob(env, failedPost.id)).model).toBe(cachedModel)
    } finally {
      cachedGet.mockRestore()
    }
  } finally {
    getEventSpy.mockRestore()
    await mf.dispose()
  }
}, 60000)
