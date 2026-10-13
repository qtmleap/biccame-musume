import { expect, spyOn, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import * as discord from '@api/services/discord'
import * as eventService from '@api/services/event-service'
import { rejudgeWebhookJob, resolveWebhookJob, retryWebhookJob } from '@api/services/webhook-admin'
import { extractWebhookEvents } from '@api/services/webhook-extraction'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import type { Bindings } from '@api/types/bindings'
import type { EventDetectionNotification } from '@biccame/shared/bot'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import type { ClefAnswer, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { EventDetailSchema, EventRequestSchema } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const makePost = (id: string, text: string): DetectPost => ({
  id,
  text,
  screenName: 'bic_akiba',
  kind: 'original',
  createdAt: '2026-10-11T00:00:00Z',
  url: `https://x.com/bic_akiba/status/${id}`,
  media: []
})
const answer = (request: ClefRequest): ClefResponse => ({
  answers: Object.fromEntries(
    Object.entries(request.questions).map(([id, question]): [string, ClefAnswer] => {
      if (question.type === 'noul') return [id, { type: 'noul', noul: 0.99 }]
      if (question.type === 'score') return [id, { type: 'score', score: 1, confidence: 0.99 }]
      const keys = Object.keys(question.criteria)
      const preferred: Record<string, string> = {
        status: 'start',
        category: keys.includes('ackey') ? 'ackey' : keys.includes('acsta') ? 'acsta' : 'limited_card',
        condition: keys.includes('purchase') ? 'purchase' : 'everyone',
        end_date: 'none',
        quantity: 'none'
      }
      const desired = preferred[id]
      const choice = desired !== undefined && keys.includes(desired) ? desired : keys.find((key) => key !== 'none')
      if (choice === undefined) throw new Error('Missing choice')
      return [
        id,
        {
          type: 'choice',
          choice,
          probabilities: Object.fromEntries(keys.map((key) => [key, key === choice ? 0.99 : 0]))
        }
      ]
    })
  )
})
const migrate = async (db: D1Database, until?: string) => {
  const dirs = (await readdir('prisma/migrations', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const dir of dirs) {
    if (until !== undefined && dir >= until) continue
    await db.exec(
      (await readFile(`prisma/migrations/${dir}/migration.sql`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ')
    )
  }
}
const fixture = async (name: string) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name,
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB'],
      kvNamespaces: ['BICCAME_MUSUME_EVENTS']
    })
  )
  const calls: string[] = []
  const state = { fail: '' }
  const env = Object.assign(await mf.getBindings<Bindings>(), {
    EVENT_DETECTION_QUEUE: { send: async () => {} },
    AI: {
      run: async (_model: string, raw: unknown) => {
        const request = ClefRequestSchema.safeParse(raw)
        if (!request.success) throw new Error('Invalid request')
        calls.push(request.data.state)
        if (state.fail !== '' && request.data.state.includes(state.fail)) throw new Error('Synthetic candidate failure')
        return answer(request.data)
      }
    }
  })
  const eventSpy = spyOn(eventService, 'getEvent').mockImplementation(async (_env, id) => {
    const json = await env.DB.prepare('SELECT candidate_json FROM webhook_event_candidates WHERE event_id=?')
      .bind(id)
      .first<string>('candidate_json')
    const candidate = EventRequestSchema.safeParse(json === null ? null : JSON.parse(json))
    if (!candidate.success) throw new Error('Invalid stored event fixture')
    const detail = EventDetailSchema.safeParse({
      ...candidate.data,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
      status: 'ongoing',
      daysUntil: 0,
      interestedCount: 0,
      completedCount: 0,
      comments: []
    })
    if (!detail.success) throw new Error('Invalid event detail fixture')
    return detail.data
  })
  const cleanup = async () => {
    eventSpy.mockRestore()
    await mf.dispose()
  }
  return { cleanup, env, calls, state }
}

// モデルの文章理解を偽装せず、抽出された原文断片を使った保存・分割・再試行を検証する。
test('同カテゴリの2配布物を独立登録し、同投稿URLと再試行でも潰さない', async () => {
  const { cleanup, env, calls } = await fixture('multiple-giveaway-registration')
  const notifications: EventDetectionNotification[] = []
  const delivery = spyOn(discord, 'notifyEventDetection').mockImplementation(async (_env, input) => {
    notifications.push(input)
    return { status: 'sent', messageId: '1234567890' }
  })
  try {
    await migrate(env.DB)
    const red = '本日から赤い限定名刺をどなたでも配布します。'
    const blue = '本日から青い限定名刺をどなたでも配布します。'
    const post = makePost('2109221721773576390', `${red}\n${blue}`)
    const extractor = async () => ({
      events: [
        { item: '赤い限定名刺', evidence: [red] },
        { item: '青い限定名刺', evidence: [blue] }
      ]
    })
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, { extractor })
    const saved = await getWebhookJob(env, post.id)
    expect(saved.status).toBe('registered')
    expect(saved.candidates.map((candidate) => candidate.status)).toEqual(['registered', 'registered'])
    expect(new Set(saved.candidates.map((candidate) => candidate.eventUUID)).size).toBe(2)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS total FROM event_reference_urls WHERE url=?')
        .bind(post.url)
        .first<number>('total')
    ).toBe(2)
    expect(calls).toHaveLength(2)
    expect(notifications.map((notification) => notification.candidate?.total)).toEqual([2, 2])
    expect(notifications.map((notification) => notification.candidate?.index)).toEqual([1, 2])
    await processWebhookJob(env, post.id, {
      extractor: async () => {
        throw new Error('Must not extract again')
      }
    })
    expect(calls).toHaveLength(2)
    expect(notifications).toHaveLength(2)
    const duplicate = makePost('2109221721773576391', post.text)
    await insertWebhookJob(env, duplicate)
    await processWebhookJob(env, duplicate.id, { extractor })
    expect((await getWebhookJob(env, duplicate.id)).candidates.map((candidate) => candidate.status)).toEqual([
      'held',
      'held'
    ])
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('片方の情報不足・再判定・手動解決で成功済み候補を変更しない', async () => {
  const { cleanup, env, calls } = await fixture('multiple-giveaway-partial')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    await migrate(env.DB)
    const key = '10/16から3,000円以上ご購入でハロウィンアクリルキーホルダ―をプレゼントします。'
    const card = 'ハロウィン限定名刺も用意しています。'
    const post = makePost('2109221721773576392', `${key}\n${card}`)
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, {
      extractor: async () => ({
        events: [
          { item: 'ハロウィンアクキー', evidence: [key] },
          { item: 'ハロウィン限定名刺', evidence: [card] }
        ]
      })
    })
    const saved = await getWebhookJob(env, post.id)
    expect(saved.status).toBe('held')
    const registered = saved.candidates[0]
    const held = saved.candidates[1]
    expect(registered.status).toBe('registered')
    expect(registered.candidate?.category).toBe('ackey')
    expect(registered.candidate?.conditions[0].purchaseAmount).toBe(3000)
    expect(held.status).toBe('held')
    expect(held.reasons).toContain('start_date_unconfirmed')
    expect(held.reasons).toContain('distribution_condition_unconfirmed')
    expect(held.reasons).not.toContain('multiple_or_ambiguous_events')
    expect(held.post.text).not.toContain('3,000円')
    await expect(resolveWebhookJob(env, post.id, { action: 'reject' })).rejects.toThrow('Select a webhook candidate')
    await rejudgeWebhookJob(env, post.id, held.eventUUID)
    await processWebhookJob(env, post.id)
    expect(calls).toHaveLength(3)
    const rejudged = await getWebhookJob(env, post.id)
    expect(rejudged.candidates[0].eventId).toBe(registered.eventId)
    expect(rejudged.candidates[1].eventUUID).toBe(held.eventUUID)
    if (registered.candidate === null) throw new Error('Expected candidate')
    const event = {
      ...registered.candidate,
      uuid: held.eventUUID,
      category: 'limited_card' as const,
      title: 'ハロウィン限定名刺',
      conditions: [{ uuid: crypto.randomUUID(), type: 'everyone' as const }],
      referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce' as const, url: post.url }]
    }
    await resolveWebhookJob(env, post.id, { action: 'register', candidateId: held.eventUUID, event })
    await processWebhookJob(env, post.id)
    const resolved = await getWebhookJob(env, post.id)
    expect(resolved.status).toBe('registered')
    expect(resolved.candidates[0].eventId).toBe(registered.eventId)
    expect(resolved.candidates[1].candidate?.conditions).toEqual(event.conditions)
    expect(calls).toHaveLength(3)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('同配布物でも日付・購入条件が違えば別候補、失敗した候補だけを再試行する', async () => {
  const { cleanup, env, calls, state } = await fixture('multiple-giveaway-retry')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    await migrate(env.DB)
    const first = '10/16から1,000円以上購入で記念限定名刺を配布します。'
    const second = '10/16から3,000円以上購入で記念限定名刺を配布します。'
    const post = makePost('2109221721773576393', `${first}\n${second}`)
    state.fail = '3,000円'
    await insertWebhookJob(env, post)
    await expect(
      processWebhookJob(env, post.id, {
        extractor: async () => ({
          events: [
            { item: '記念限定名刺', evidence: [first] },
            { item: '記念限定名刺', evidence: [second] }
          ]
        })
      })
    ).rejects.toThrow('Synthetic candidate failure')
    const partial = await getWebhookJob(env, post.id)
    expect(partial.candidates.map((candidate) => candidate.status)).toEqual(['registered', 'failed'])
    state.fail = ''
    await retryWebhookJob(env, post.id, {
      notificationOnly: false,
      allowUnknown: false,
      candidateId: partial.candidates[1].eventUUID
    })
    await processWebhookJob(env, post.id)
    const done = await getWebhookJob(env, post.id)
    expect(done.candidates.map((candidate) => candidate.status)).toEqual(['registered', 'registered'])
    expect(done.candidates.map((candidate) => candidate.candidate?.conditions[0].purchaseAmount)).toEqual([1000, 3000])
    expect(done.candidates[0].eventId).toBe(partial.candidates[0].eventId)
    expect(calls).toHaveLength(3)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('複数店舗を選択候補の店舗へ限定し、同一候補の並行処理は重複登録しない', async () => {
  const { cleanup, env } = await fixture('multiple-giveaway-stores')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    await migrate(env.DB)
    const text = 'アキバたんとあべのたんの限定名刺を本日からどなたでも配布します。'
    const post = makePost('2109221721773576394', text)
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, {
      extractor: async () => ({
        events: [
          { item: '合同限定名刺', store: 'akiba', evidence: [text] },
          { item: '合同限定名刺', store: 'abeno', evidence: [text] }
        ]
      })
    })
    const job = await getWebhookJob(env, post.id)
    expect(job.candidates.map((candidate) => candidate.candidate?.stores)).toEqual([['akiba'], ['abeno']])
    const repeated = [
      makePost('2109221721773576395', '本日から競合限定名刺をどなたでも配布します。'),
      makePost('2109221721773576396', '本日から競合限定名刺をどなたでも配布します。')
    ]
    for (const value of repeated) await insertWebhookJob(env, value)
    const extractor = async (value: DetectPost) => ({ events: [{ item: '競合限定名刺', evidence: [value.text] }] })
    await Promise.allSettled(repeated.map((value) => processWebhookJob(env, value.id, { extractor })))
    for (const value of repeated) await processWebhookJob(env, value.id)
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS total FROM events WHERE title='競合限定名刺'").first<number>('total')
    ).toBe(1)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

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
            input: { events: [{ item: '限定名刺', store: 'akiba', evidence: [post.text] }] }
          }
        ]
      })
    })
    expect(result.events).toHaveLength(1)
    await expect(extractWebhookEvents(env, post)).rejects.toThrow('not configured')
    await expect(
      extractWebhookEvents(configured, post, async () =>
        Response.json({
          content: [
            { type: 'tool_use', name: 'answer', input: { events: [{ item: '限定名刺', evidence: ['創作した条件'] }] } }
          ]
        })
      )
    ).rejects.toThrow('unsupported evidence')
    await migrate(env.DB)
    await insertWebhookJob(env, post)
    await expect(processWebhookJob(env, post.id)).rejects.toThrow('not configured')
    const failed = await getWebhookJob(env, post.id)
    expect(failed.status).toBe('failed')
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
        events: held.text
          .split('\n')
          .map((evidence, index) => ({ item: index === 0 ? '赤い限定名刺' : '青い限定名刺', evidence: [evidence] }))
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
    const oldPost = makePost('2109221721773576410', '10月11日より1,000円以上ご購入で限定名刺を配布します。')
    const uuid = crypto.randomUUID()
    const candidate = EventRequestSchema.safeParse({
      uuid,
      category: 'limited_card',
      title: 'アキバたん 限定名刺配布',
      stores: ['akiba'],
      startDate: '2026-10-11T00:00:00+09:00',
      isVerified: true,
      isPreliminary: false,
      shouldTweet: false,
      conditions: [{ uuid: crypto.randomUUID(), type: 'purchase', purchaseAmount: 1000 }],
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
    const migrated = await getWebhookJob(env, oldPost.id)
    expect(migrated.candidates[0].item).toBe('アキバたん 限定名刺配布')
    const item = '秋の限定名刺'
    expect(migrated.candidates[0].item).not.toBe(item)
    const repost = makePost('2109221721773576411', oldPost.text)
    await insertWebhookJob(env, repost)
    await processWebhookJob(env, repost.id, {
      extractor: async () => ({ events: [{ item, evidence: [repost.text] }] })
    })
    const held = await getWebhookJob(env, repost.id)
    expect(held.candidates[0].status).toBe('held')
    expect(held.candidates[0].reasons).toContain(`possible_duplicate:${uuid}`)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(1)
    // 旧行との照合でも、購入条件が違えば別の配布候補として登録する。
    const different = makePost('2109221721773576412', '10月11日より3,000円以上ご購入で限定名刺を配布します。')
    await insertWebhookJob(env, different)
    await processWebhookJob(env, different.id, {
      extractor: async () => ({ events: [{ item, evidence: [different.text] }] })
    })
    expect((await getWebhookJob(env, different.id)).candidates[0].status).toBe('registered')
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
    expect((await getWebhookJob(env, oldPost.id)).candidates[0].eventId).toBe(uuid)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)
