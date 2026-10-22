import { expect, spyOn, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import * as discord from '@api/services/discord'
import { rejudgeWebhookJob, retryWebhookJob } from '@api/services/webhook-admin'
import { extractWebhookEvents } from '@api/services/webhook-extraction'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

test('抽出通信を検証し、未設定・不正根拠は再試行できる失敗にする', async () => {
  const { cleanup, env } = await fixture('multiple-giveaway-extraction')
  try {
    const post = makePost('2109221721773576397', '本日から限定名刺をどなたでも配布します。')
    const configured = {
      ...env,
      ANTHROPIC_BASE_URL: 'https://model.example.test/',
      ANTHROPIC_AUTH_TOKEN: 'synthetic-token'
    }
    const result = await extractWebhookEvents(configured, post, async (url, init) => {
      expect(url).toBe('https://model.example.test/v1/messages')
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer synthetic-token')
      return Response.json({
        content: [
          {
            type: 'tool_use',
            name: 'answer',
            input: { events: [{ item: '限定名刺', stores: ['akiba'], characterIds: [], evidence: [post.text] }] }
          }
        ]
      })
    })
    expect(result.events).toHaveLength(1)
    await expect(extractWebhookEvents(env, post)).rejects.toThrow('extraction_not_configured')
    await expect(
      extractWebhookEvents(configured, post, async () =>
        Response.json({
          content: [
            {
              type: 'tool_use',
              name: 'answer',
              input: { events: [{ item: '限定名刺', stores: ['akiba'], characterIds: [], evidence: ['創作した条件'] }] }
            }
          ]
        })
      )
    ).rejects.toThrow('unsupported evidence')
    await migrate(env.DB)
    await insertWebhookJob(env, post)
    await expect(processWebhookJob(env, post.id)).rejects.toThrow('extraction_not_configured')
    const failed = await getWebhookJob(env, post.id)
    expect(failed.status).toBe('failed')
    expect(failed.lastError).toBe('extraction_not_configured')
    expect(failed.candidates).toEqual([])
  } finally {
    await cleanup()
  }
}, 60000)

test('旧単一ジョブのUUID・回答・通知状態を保持し、旧保留だけを再抽出する', async () => {
  const { cleanup, env } = await fixture('multiple-giveaway-legacy')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    const migration = '20261013123514_multiple_giveaway_events'
    await migrate(env.DB, migration)
    const text = '本日から赤い限定名刺をどなたでも配布します。\n本日から青い限定名刺をどなたでも配布します。'
    const held = makePost('2109221721773576398', text)
    const registered = makePost('2109221721773576399', text)
    const registeredUUID = crypto.randomUUID()
    const heldUUID = crypto.randomUUID()
    const answers = JSON.stringify({
      is_event: { type: 'noul', noul: 0.99 },
      single_event: { type: 'noul', noul: 0.2 }
    })
    for (const [post, uuid, status] of [
      [held, heldUUID, 'held'],
      [registered, registeredUUID, 'registered']
    ] as const) {
      await env.DB.prepare(`INSERT INTO webhook_event_jobs
        (post_id,post_json,source_url,event_uuid,status,result_json,answers_json,question_version,notification_status,notification_id,notification_attempts,event_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(
          post.id,
          JSON.stringify(post),
          post.url,
          uuid,
          status,
          JSON.stringify({ status: 'held', confidence: 0.99, reasons: ['multiple_or_ambiguous_events'] }),
          answers,
          'v2-webhook-v3',
          'sent',
          '1234567890',
          2,
          status === 'registered' ? uuid : null,
          1791676800000,
          1791676800000
        )
        .run()
    }
    await env.DB.exec(
      (await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
        .replace(/^--.*$/gm, '')
        .replace(/\n/g, ' ')
    )
    await migrate(env.DB, undefined, migration)
    const copied = await getWebhookJob(env, registered.id)
    expect(copied.candidates).toHaveLength(1)
    expect(copied.candidates[0].eventUUID).toBe(registeredUUID)
    expect(copied.candidates[0].notificationStatus).toBe('sent')
    expect(copied.candidates[0].notificationAttempts).toBe(2)
    expect(copied.candidates[0].answers?.single_event).toEqual({ type: 'noul', noul: 0.2 })
    await expect(rejudgeWebhookJob(env, registered.id)).rejects.toThrow('cannot be re-judged')
    await rejudgeWebhookJob(env, held.id, heldUUID)
    expect((await getWebhookJob(env, held.id)).candidates).toHaveLength(0)
    await processWebhookJob(env, held.id, {
      extractor: async () => ({
        events: held.text.split('\n').map((evidence, index) => ({
          item: index === 0 ? '赤い限定名刺' : '青い限定名刺',
          stores: ['akiba'],
          characterIds: [],
          evidence: [evidence]
        }))
      })
    })
    expect((await getWebhookJob(env, held.id)).candidates.map((candidate) => candidate.status)).toEqual([
      'registered',
      'registered'
    ])
    expect((await getWebhookJob(env, registered.id)).candidates[0].eventUUID).toBe(registeredUUID)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('候補単位の通知不明は盲目的に再送せず、承認された候補だけ再送する', async () => {
  const { cleanup, env, calls } = await fixture('multiple-giveaway-notification')
  const sent: string[] = []
  const state = { unknown: true }
  const delivery = spyOn(discord, 'notifyEventDetection').mockImplementation(async (_env, input) => {
    sent.push(input.requestId)
    return state.unknown && input.candidate?.index === 1
      ? { status: 'unknown', kind: 'delivery_unknown' }
      : { status: 'sent', messageId: '1234567890' }
  })
  try {
    await migrate(env.DB)
    const lines = [
      '本日から通知用赤い限定名刺をどなたでも配布します。',
      '本日から通知用青い限定名刺をどなたでも配布します。'
    ]
    const post = makePost('2109221721773576400', lines.join('\n'))
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, {
      extractor: async () => ({
        events: lines.map((evidence, index) => ({
          item: index === 0 ? '通知用赤い限定名刺' : '通知用青い限定名刺',
          stores: ['akiba'],
          characterIds: [],
          evidence: [evidence]
        }))
      })
    })
    const job = await getWebhookJob(env, post.id)
    expect(job.candidates.map((candidate) => candidate.notificationStatus)).toEqual(['unknown', 'sent'])
    await processWebhookJob(env, post.id)
    expect(sent).toHaveLength(2)
    const candidateId = job.candidates[0].eventUUID
    await expect(
      retryWebhookJob(env, post.id, { candidateId, notificationOnly: true, allowUnknown: false })
    ).rejects.toThrow('explicit confirmation')
    state.unknown = false
    await retryWebhookJob(env, post.id, { candidateId, notificationOnly: true, allowUnknown: true })
    await processWebhookJob(env, post.id)
    expect(sent).toEqual([candidateId, job.candidates[1].eventUUID, candidateId])
    expect(calls).toHaveLength(2)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('旧移行済みイベントの生成タイトルと新抽出名が違っても再告知を重複登録しない', async () => {
  const { cleanup, env } = await fixture('multiple-giveaway-legacy-duplicate')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    const migration = '20261013123514_multiple_giveaway_events'
    await migrate(env.DB, migration)
    const oldPost = makePost(
      '2109221721773576410',
      '10月11日より1,000円以上ご購入の方に先着100名で限定名刺を配布します。'
    )
    const uuid = crypto.randomUUID()
    const candidate = EventRequestSchema.safeParse({
      uuid,
      category: 'limited_card',
      title: 'アキバたん 限定名刺配布',
      stores: ['akiba'],
      characterIds: [],
      startDate: '2026-10-11T00:00:00+09:00',
      isVerified: true,
      isPreliminary: false,
      shouldTweet: false,
      conditions: [
        { uuid: crypto.randomUUID(), type: 'purchase', purchaseAmount: 1000 },
        { uuid: crypto.randomUUID(), type: 'first_come', quantity: 100 }
      ],
      referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: oldPost.url }]
    })
    if (!candidate.success) throw new Error('Invalid legacy candidate fixture')
    const timestamp = toD1DateTime(dayjs().valueOf())
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO events (id,category,title,start_date,is_verified,is_preliminary,created_at,updated_at) VALUES (?,?,?,?,1,0,?,?)'
      ).bind(
        uuid,
        candidate.data.category,
        candidate.data.title,
        toD1DateTime(candidate.data.startDate),
        timestamp,
        timestamp
      ),
      env.DB.prepare('INSERT INTO event_stores (id,event_id,store_key,created_at,updated_at) VALUES (?,?,?,?,?)').bind(
        crypto.randomUUID(),
        uuid,
        'akiba',
        timestamp,
        timestamp
      ),
      env.DB.prepare(`INSERT INTO webhook_event_jobs (post_id,post_json,source_url,event_uuid,status,candidate_json,result_json,event_id,question_version,notification_status,created_at,updated_at)
        VALUES (?,?,?,?,'registered',?,?,?,'v2-webhook-v3','sent',?,?)`).bind(
        oldPost.id,
        JSON.stringify(oldPost),
        oldPost.url,
        uuid,
        JSON.stringify(candidate.data),
        JSON.stringify({ status: 'register', confidence: 0.99, reasons: [], candidate: candidate.data }),
        uuid,
        dayjs().valueOf(),
        dayjs().valueOf()
      )
    ])
    await env.DB.exec(
      (await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
        .replace(/^--.*$/gm, '')
        .replace(/\n/g, ' ')
    )
    await migrate(env.DB, undefined, migration)
    const migrated = await getWebhookJob(env, oldPost.id)
    expect(migrated.candidates[0].item).toBe('アキバたん 限定名刺配布')
    const item = '秋の限定名刺'
    expect(migrated.candidates[0].item).not.toBe(item)
    const repost = makePost('2109221721773576411', oldPost.text)
    await insertWebhookJob(env, repost)
    await processWebhookJob(env, repost.id, {
      extractor: async () => ({ events: [{ item, stores: ['akiba'], characterIds: [], evidence: [repost.text] }] })
    })
    const held = await getWebhookJob(env, repost.id)
    expect(held.candidates[0].status).toBe('held')
    expect(held.candidates[0].reasons).toContain(`possible_duplicate:${uuid}`)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(1)
    // 旧行との照合でも、購入条件が違えば別の配布候補として登録する。
    const different = makePost(
      '2109221721773576412',
      '10月11日より3,000円以上ご購入の方に先着100名で限定名刺を配布します。'
    )
    await insertWebhookJob(env, different)
    await processWebhookJob(env, different.id, {
      extractor: async () => ({ events: [{ item, stores: ['akiba'], characterIds: [], evidence: [different.text] }] })
    })
    expect((await getWebhookJob(env, different.id)).candidates[0].status).toBe('registered')
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
    expect((await getWebhookJob(env, oldPost.id)).candidates[0].eventId).toBe(uuid)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)
