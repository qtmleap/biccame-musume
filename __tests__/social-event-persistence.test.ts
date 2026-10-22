import { expect, test } from 'bun:test'
import { createEvent, updateEvent } from '@api/services/event-service'
import { resolveWebhookJob } from '@api/services/webhook-admin'
import { duplicateWebhookEvents, insertWebhookJob, validateWebhookEvent } from '@api/services/webhook-jobs'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { nonCanonicalDateTimes, registerFromWebhook, request, withPosting } from './fixtures/social-event-datetimes'
import { uuid, withDatabase } from './fixtures/social-event-selection-db'
import { WEEK } from './fixtures/social-event-week'

test('atomic manual saves and webhook registrations store Prisma DateTime text and match daily and weekly start and end selection', async () => {
  await withDatabase(async (env, select, create) => {
    const posting = withPosting(env)
    await createEvent(
      posting,
      request(1, { startDate: '2026-10-12T10:00:00+09:00', endDate: '2026-10-18T23:59:59+09:00' })
    )
    await createEvent(
      posting,
      request(2, { startDate: '2026-10-01T00:00:00+09:00', endDate: '2026-10-12T23:59:59+09:00' })
    )
    await create(request(3, { startDate: '2026-10-12T05:00:00+09:00', shouldTweet: false }))
    const startingHook = await registerFromWebhook(posting, 4, { startDate: '2026-10-12', endDate: '2026-10-25' })
    const endingHook = await registerFromWebhook(posting, 5, { startDate: '2026-10-05', endDate: '2026-10-12' })
    // atomic 更新も同じ形式で書き、文字列の updated_at を使う版の CAS が連続更新でも一致し続けることを確かめる。
    for (const title of ['更新後', '再更新']) {
      await updateEvent(
        posting,
        request(1, { title, startDate: '2026-10-12T10:00:00+09:00', endDate: '2026-10-18T23:59:59+09:00' })
      )
    }
    expect(await select('starting', { now: '2026-10-12T09:00:00+09:00' })).toEqual([startingHook, uuid(3), uuid(1)])
    expect(await select('ending', { now: '2026-10-12T09:00:00+09:00' })).toEqual([uuid(2), endingHook])
    // 週内に開始: 1, 3, startingHook。週内に終了（日曜 23:59:59 を含む）: 1, 2, endingHook。
    expect((await select('weekStarting', WEEK)).sort()).toEqual([uuid(1), uuid(3), startingHook].sort())
    expect((await select('weekEnding', WEEK)).sort()).toEqual([uuid(1), uuid(2), endingHook].sort())
    expect(await nonCanonicalDateTimes(env)).toEqual([])
    const startDate = (id: string) =>
      env.DB.prepare('SELECT start_date FROM events WHERE id=?').bind(id).first<string>('start_date')
    // Prisma が書いた行と生SQLの行が同じ文字列形式であることを直接比べる。
    expect(await startDate(uuid(3))).toBe('2026-10-11T20:00:00.000+00:00')
    expect(toD1DateTime('2026-10-12T05:00:00+09:00')).toBe('2026-10-11T20:00:00.000+00:00')
    expect(await startDate(uuid(1))).toBe('2026-10-12T01:00:00.000+00:00')
    expect(await startDate(startingHook)).toBe('2026-10-11T15:00:00.000+00:00')
    expect(
      await env.DB.prepare('SELECT clef_judged_at FROM events WHERE id=?')
        .bind(startingHook)
        .first<string>('clef_judged_at')
    ).toBe('2026-10-11T00:00:00.456+00:00')
  })
}, 60000)

test('webhook duplicate lookup matches Prisma-created and atomically saved events on the same start date', async () => {
  await withDatabase(async (env, _select, create) => {
    const posting = withPosting(env)
    await create(request(1, { startDate: '2026-10-20T00:00:00+09:00', shouldTweet: false }))
    await createEvent(posting, request(2, { startDate: '2026-10-21T00:00:00+09:00' }))
    const incoming = (startDate: string) =>
      validateWebhookEvent({ ...request(9, { startDate }), shouldTweet: false }, uuid(9))
    const sourceUrl = 'https://x.com/bic_akiba/status/2109221721773576999'
    expect(await duplicateWebhookEvents(posting, incoming('2026-10-20'), sourceUrl)).toEqual([uuid(1)])
    expect(await duplicateWebhookEvents(posting, incoming('2026-10-21'), sourceUrl)).toEqual([uuid(2)])
    expect(await duplicateWebhookEvents(posting, incoming('2026-10-22'), sourceUrl)).toEqual([])
  })
}, 60000)

test('manual webhook link stores the added reference URL timestamps as Prisma DateTime text', async () => {
  await withDatabase(async (env, _select, create) => {
    await create(request(1, { startDate: '2026-10-20T00:00:00+09:00', shouldTweet: false }))
    const postId = '2109221721773576101'
    const sourceUrl = `https://x.com/bic_akiba/status/${postId}`
    await insertWebhookJob(env, {
      id: postId,
      createdAt: '2026-10-11T00:00:00Z',
      screenName: 'bic_akiba',
      kind: 'original',
      text: '既存イベントへの紐付け',
      url: sourceUrl,
      media: []
    })
    await env.DB.prepare("UPDATE webhook_event_jobs SET status='held' WHERE post_id=?").bind(postId).run()
    const queued = Object.assign(env, { EVENT_DETECTION_QUEUE: { send: async () => {} } })
    await resolveWebhookJob(queued, postId, { action: 'link', eventId: uuid(1) })
    expect(
      (
        await env.DB.prepare(
          'SELECT event_id AS eventId,typeof(created_at) AS createdType,typeof(updated_at) AS updatedType FROM event_reference_urls WHERE url=?'
        )
          .bind(sourceUrl)
          .all()
      ).results
    ).toEqual([{ eventId: uuid(1), createdType: 'text', updatedType: 'text' }])
    expect(await nonCanonicalDateTimes(env)).toEqual([])
  })
}, 60000)
