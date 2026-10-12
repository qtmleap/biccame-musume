import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { getWebhookJob, insertWebhookJob, listWebhookJobs, registerWebhookEvent } from '@api/services/webhook-jobs'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const event: EventRequest = {
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  category: 'limited_card',
  title: 'テスト配布',
  stores: ['akiba'],
  startDate: '2026-10-11T00:00:00+09:00',
  isVerified: true,
  isPreliminary: false,
  shouldTweet: false,
  conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
  referenceUrls: [
    {
      uuid: '22222222-2222-4222-a222-222222222222',
      type: 'announce',
      url: 'https://x.com/bic_akiba/status/2109221721773576390'
    }
  ]
}
const makeJob = () => {
  const parsed = WebhookJobSchema.safeParse({
    postId: '2109221721773576390',
    post: {
      id: '2109221721773576390',
      screenName: 'bic_akiba',
      text: '本日より限定名刺を全員に配布',
      createdAt: '2026-10-11T00:00:00Z',
      kind: 'original',
      url: event.referenceUrls[0].url,
      media: []
    },
    sourceUrl: event.referenceUrls[0].url,
    eventUUID: event.uuid,
    status: 'processing',
    reasons: [],
    candidate: event,
    confidence: 0.99,
    model: 'clef',
    questionVersion: 'test-v1',
    eventId: null,
    eventTitle: null,
    postStatus: 'start',
    attempts: 1,
    notificationStatus: 'pending',
    notificationId: null,
    notificationError: null,
    notificationAttempts: 0,
    lastError: null,
    createdAt: '2026-10-11T00:00:00Z',
    updatedAt: '2026-10-11T00:00:00Z',
    judgedAt: '2026-10-11T00:00:00Z'
  })
  if (!parsed.success) throw new Error('Invalid test job')
  return parsed.data
}

test('local D1 atomically registers event children and job; failed batch rolls back', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-d1-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const db = await mf.getD1Database('DB')
    const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) {
      const sql = await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')
      await db.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))
    }
    const job = makeJob()
    await db
      .prepare(
        `INSERT INTO webhook_event_jobs(post_id,post_json,source_url,event_uuid,status,lease_token,answers_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        job.postId,
        JSON.stringify(job.post),
        job.sourceUrl,
        job.eventUUID,
        'processing',
        'test-lease',
        '{"is_event":{"type":"noul","noul":0.99}}',
        1791676800000,
        1791676800000
      )
      .run()
    const invalid = { ...event, conditions: [event.conditions[0], event.conditions[0]] }
    await expect(registerWebhookEvent({ DB: db }, job, invalid, 'test-lease')).rejects.toThrow()
    expect(await db.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(0)
    expect(await db.prepare('SELECT status FROM webhook_event_jobs').first<string>('status')).toBe('processing')
    await registerWebhookEvent({ DB: db }, job, event, 'test-lease')
    expect(await db.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    expect(await db.prepare('SELECT count(*) AS total FROM event_conditions').first<number>('total')).toBe(1)
    expect(await db.prepare('SELECT count(*) AS total FROM event_stores').first<number>('total')).toBe(1)
    expect(await db.prepare('SELECT count(*) AS total FROM event_reference_urls').first<number>('total')).toBe(1)
    expect(await db.prepare('SELECT status FROM webhook_event_jobs').first<string>('status')).toBe('registered')
    expect(await db.prepare('SELECT clef_answers FROM events').first<string>('clef_answers')).toBe(
      '{"is_event":{"type":"noul","noul":0.99}}'
    )
    await expect(registerWebhookEvent({ DB: db }, job, event, 'different-lease')).rejects.toThrow('lease lost')
    expect(await db.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)

    await db.prepare('UPDATE events SET title=? WHERE id=?').bind('紐付け先の実イベント名', event.uuid).run()
    await db
      .prepare('UPDATE webhook_event_jobs SET candidate_json=NULL,confidence=0.72,model=? WHERE post_id=?')
      .bind('clef-flash', job.postId)
      .run()
    for (const status of ['announce', 'start', 'ongoing', 'end'] as const) {
      await db
        .prepare('UPDATE webhook_event_jobs SET answers_json=? WHERE post_id=?')
        .bind(
          JSON.stringify({ status: { type: 'choice', choice: status, probabilities: { [status]: 0.99 } } }),
          job.postId
        )
        .run()
      const detail = await getWebhookJob({ DB: db }, job.postId)
      const page = await listWebhookJobs({ DB: db }, { limit: 1, status: 'registered' })
      expect(detail).toMatchObject({
        postStatus: status,
        eventId: event.uuid,
        eventTitle: '紐付け先の実イベント名',
        candidate: null,
        confidence: 0.72,
        model: 'clef-flash'
      })
      expect(page.jobs[0]).toEqual(detail)
      expect(page.nextCursor).toBeNull()
    }
    for (const answers of [
      null,
      '{}',
      '{broken',
      '{"status":{"type":"noul","noul":0.9}}',
      '{"status":{"type":"choice","choice":"none","probabilities":{"none":1}}}',
      '{"status":{"type":"choice","choice":"future","probabilities":{"future":1}}}',
      '{"status":{"type":"choice","choice":"start","probabilities":{"start":2}}}'
    ]) {
      await db.prepare('UPDATE webhook_event_jobs SET answers_json=? WHERE post_id=?').bind(answers, job.postId).run()
      expect((await getWebhookJob({ DB: db }, job.postId)).postStatus).toBeNull()
    }

    const unlinked = await insertWebhookJob({ DB: db }, { ...job.post, id: '2109221721773576391' })
    expect(unlinked).toMatchObject({ postStatus: null, eventId: null, eventTitle: null, model: null, confidence: null })
    await db.prepare('UPDATE webhook_event_jobs SET created_at=?').bind(1791676800000).run()
    const first = await listWebhookJobs({ DB: db }, { limit: 1 })
    expect(first.jobs[0].postId).toBe(unlinked.postId)
    expect(first.nextCursor).toBe(unlinked.postId)
    const second = await listWebhookJobs({ DB: db }, { limit: 1, cursor: unlinked.postId })
    expect(second.jobs[0].postId).toBe(job.postId)
    expect(second.nextCursor).toBeNull()
    await db.prepare('DELETE FROM events WHERE id=?').bind(event.uuid).run()
    expect((await getWebhookJob({ DB: db }, job.postId)).eventTitle).toBeNull()
  } finally {
    await mf.dispose()
  }
}, 60000)
