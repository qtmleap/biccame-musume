import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { readAtomicManualEvent } from '@api/services/event-service'
import {
  claimWebhookJob,
  duplicateWebhookEvents,
  getWebhookJob,
  insertWebhookJob,
  listWebhookJobs,
  registerWebhookEvent
} from '@api/services/webhook-jobs'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { WebhookJobSchema } from '@biccame/shared/schemas/webhook.dto'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { event, makeJob, withRejudgeEnv } from './fixtures/webhook-d1-jobs'

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

    const { characterIds: _legacyCharacters, ...legacyCandidate } = event
    await db
      .prepare('UPDATE webhook_event_jobs SET candidate_json=? WHERE post_id=?')
      .bind(JSON.stringify(legacyCandidate), job.postId)
      .run()
    expect((await getWebhookJob({ DB: db }, job.postId)).candidate).toEqual({ ...legacyCandidate, characterIds: [] })
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
        postStatusProbability: 0.99,
        answers: { status: { type: 'choice', choice: status, probabilities: { [status]: 0.99 } } },
        draft: null,
        eventId: event.uuid,
        eventTitle: '紐付け先の実イベント名',
        candidate: null,
        confidence: 0.72,
        model: 'clef-flash'
      })
      expect(page.jobs[0]).toEqual(detail)
      expect(page.nextCursor).toBeNull()
    }
    // [保存された answers_json, answers が null になるか]。壊れた JSON・スキーマ違反は null、読める回答は postStatus が無くても残す。
    for (const [answers, broken] of [
      [null, true],
      ['{}', false],
      ['{broken', true],
      ['{"status":{"type":"noul","noul":0.9}}', false],
      ['{"status":{"type":"choice","choice":"none","probabilities":{"none":1}}}', false],
      ['{"status":{"type":"choice","choice":"future","probabilities":{"future":1}}}', false],
      ['{"status":{"type":"choice","choice":"start","probabilities":{"start":2}}}', true]
    ] as const) {
      await db.prepare('UPDATE webhook_event_jobs SET answers_json=? WHERE post_id=?').bind(answers, job.postId).run()
      const unreadable = await getWebhookJob({ DB: db }, job.postId)
      expect(unreadable.postStatus).toBeNull()
      expect(unreadable.postStatusProbability).toBeNull()
      expect(unreadable.draft).toBeNull()
      expect(unreadable.answers === null).toBe(broken)
    }

    // 保留ジョブだけが、保存済みの回答から読み取り時に計算した下書きを持つ。
    const heldAnswers: Record<string, ClefAnswer> = {
      is_event: { type: 'noul', noul: 0.72 },
      status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.7499, start: 0.2 } },
      category: { type: 'choice', choice: 'acsta', probabilities: { acsta: 0.45, ackey: 0.43, other: 0.02 } },
      store: { type: 'choice', choice: 'none', probabilities: { none: 0.61, akiba: 0.39 } },
      start_date: { type: 'choice', choice: 'd20261011', probabilities: { d20261011: 0.8, none: 0.1 } },
      condition: { type: 'choice', choice: 'everyone', probabilities: { everyone: 0.7, none: 0.2 } }
    }
    const setHeld = async (status: string, answers: unknown) => {
      await db
        .prepare('UPDATE webhook_event_jobs SET status=?,answers_json=?,event_id=NULL WHERE post_id=?')
        .bind(status, answers === null ? null : JSON.stringify(answers), job.postId)
        .run()
    }
    await setHeld('held', heldAnswers)
    const held = await getWebhookJob({ DB: db }, job.postId)
    expect(held).toMatchObject({
      status: 'held',
      postStatus: 'announce',
      postStatusProbability: 0.7499,
      draft: {
        stores: [],
        characterIds: [],
        startDate: '2026-10-11',
        conditions: [{ type: 'everyone' }]
      }
    })
    expect(held.draft).not.toHaveProperty('category')
    // 管理画面の回答表に渡す保存済みの回答がそのまま返る。
    expect(held.answers).toEqual(heldAnswers)
    // 一覧も同じ内容で、下書きに乱数を含まないため詳細と一致する。
    expect((await listWebhookJobs({ DB: db }, { limit: 1, status: 'held' })).jobs[0]).toEqual(held)
    // 登録済み・対象外は回答が残っていても下書きを持たない。
    for (const status of ['registered', 'ignored', 'queued', 'failed']) {
      await setHeld(status, heldAnswers)
      const other = await getWebhookJob({ DB: db }, job.postId)
      expect(other.draft).toBeNull()
      expect(other.postStatusProbability).toBe(0.7499)
    }
    // 保留でも回答が無い・壊れている場合は例外にせず null にする。
    for (const answers of [null, 'not-json', { status: { type: 'choice', choice: 'announce' } }]) {
      await db
        .prepare('UPDATE webhook_event_jobs SET status=?,answers_json=? WHERE post_id=?')
        .bind(
          'held',
          typeof answers === 'string' ? answers : answers === null ? null : JSON.stringify(answers),
          job.postId
        )
        .run()
      const broken = await getWebhookJob({ DB: db }, job.postId)
      expect(broken.draft).toBeNull()
    }
    // 旧回答や空の回答から、開催店舗・対象キャラを推測しない。
    await setHeld('held', {})
    expect((await getWebhookJob({ DB: db }, job.postId)).draft).toEqual({
      stores: [],
      characterIds: [],
      conditions: []
    })
    // 回答の形は正しくても値が不正（存在しない日付・数量0）な場合、その項目だけ落として一覧全体は壊さない。
    await setHeld('held', {
      ...heldAnswers,
      start_date: { type: 'choice', choice: 'd20261399', probabilities: { d20261399: 0.9 } },
      end_date: { type: 'choice', choice: 'd20260230', probabilities: { d20260230: 0.9 } },
      quantity: { type: 'choice', choice: 'q0', probabilities: { q0: 0.9 } },
      condition: { type: 'choice', choice: 'first_come', probabilities: { first_come: 0.9 } }
    })
    const corrupt = await listWebhookJobs({ DB: db }, { limit: 5, status: 'held' })
    expect(corrupt.jobs).toHaveLength(1)
    const corruptDraft = WebhookJobSchema.shape.draft.safeParse(corrupt.jobs[0]?.draft)
    expect(corruptDraft.success).toBe(true)
    expect(corrupt.jobs[0]?.draft).toEqual({
      stores: [],
      characterIds: [],
      conditions: [{ type: 'first_come' }]
    })
    await setHeld('registered', heldAnswers)
    await db.prepare('UPDATE webhook_event_jobs SET event_id=? WHERE post_id=?').bind(event.uuid, job.postId).run()

    const unlinked = await insertWebhookJob({ DB: db }, { ...job.post, id: '2109221721773576391' })
    expect(unlinked).toMatchObject({
      postStatus: null,
      postStatusProbability: null,
      draft: null,
      eventId: null,
      eventTitle: null,
      model: null,
      confidence: null
    })
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

test('registration keeps multiple venues and target characters independent and separates duplicate identities', async () => {
  await withRejudgeEnv(async (env) => {
    const post = makeJob().post
    await insertWebhookJob(env, post)
    const token = await claimWebhookJob(env, post.id)
    if (token === null) throw new Error('Expected a claimed job')
    const job = await getWebhookJob(env, post.id)
    const request: EventRequest = {
      ...event,
      uuid: job.eventUUID,
      stores: ['funabashi', 'akiba'],
      characterIds: ['funato', 'kawasaki']
    }
    await registerWebhookEvent(env, job, request, token)
    const saved = await readAtomicManualEvent(env, job.eventUUID)
    expect(saved.stores).toEqual(request.stores)
    expect(saved.characterIds).toEqual(['funato', 'kawasaki'])
    expect(saved.characterIds).not.toContain('funabashi')
    expect(
      await env.DB.prepare('SELECT character_id FROM events WHERE id=?').bind(job.eventUUID).first('character_id')
    ).toBeNull()
    const other: EventRequest = { ...request, uuid: crypto.randomUUID(), characterIds: ['funabashi'] }
    expect(await duplicateWebhookEvents(env, other, job.sourceUrl)).toEqual([])
    expect(await duplicateWebhookEvents(env, { ...other, characterIds: request.characterIds }, job.sourceUrl)).toEqual([
      job.eventUUID
    ])
    const stored = await getWebhookJob(env, post.id)
    expect(stored.candidate?.characterIds).toEqual(request.characterIds)
  })
})
