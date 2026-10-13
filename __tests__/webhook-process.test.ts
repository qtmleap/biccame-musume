import { expect, spyOn, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import botRoutes from '@api/routes/admin-bot'
import * as discordService from '@api/services/discord'
import * as eventService from '@api/services/event-service'
import { resolveWebhookJob, retryWebhookJob } from '@api/services/webhook-admin'
import { EVENT_DETECTION_MODEL_KEY } from '@api/services/webhook-config'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import * as webhookProcessing from '@api/services/webhook-process'
import { TITLE_MAX_TOKENS, TITLE_MODEL, type TitleFetcher } from '@api/services/webhook-title'
import type { Bindings } from '@api/types/bindings'
import type { ClefAnswer, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { resolveFieldThresholds } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { titleSystem } from '@biccame/shared/event-detect/title'
import { EventDetailSchema } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { z } from 'zod'

// 単一候補の回帰テストでは抽出を固定し、抽出通信は別のテストで検証する。
const processWebhookJob = (env: Bindings, postId: string, options: { titleFetcher?: TitleFetcher } = {}) =>
  webhookProcessing.processWebhookJob(env, postId, {
    ...options,
    extractor: async (post) => ({ events: [{ item: 'アキバたん 限定名刺配布', evidence: [post.text] }] })
  })

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

// タイトル用の通信（Anthropic Messages）。実通信はせず、processWebhookJob に渡す titleFetcher のモックで受ける。
const TITLE_BASE_URL = 'https://anthropic.example.test/'
const TITLE_TOKEN = 'test-token-not-a-secret'
const TitleRequestSchema = z.object({
  model: z.string().nonempty(),
  max_tokens: z.number().int().positive(),
  system: z.string().nonempty(),
  messages: z.tuple([z.object({ role: z.literal('user'), content: z.string().nonempty() })]),
  tools: z.array(
    z.object({ name: z.string().nonempty(), description: z.string().nonempty(), input_schema: z.unknown() })
  ),
  tool_choice: z.object({ type: z.string().nonempty() })
})
type TitleCall = { url: string; headers: Record<string, string>; body: z.infer<typeof TitleRequestSchema> }

/** Anthropic Messages の応答。answer ツールの tool_use で題を返す（テキストの前置きつき） */
const toolReply = (input: unknown) =>
  Response.json({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [
      { type: 'text', text: '題を付けます。' },
      { type: 'tool_use', id: 'toolu_test', name: 'answer', input }
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 1, output_tokens: 1 }
  })
const titleReply = (title: string) => toolReply({ title })

/**
 * Clef の呼び出し（env.AI.run）は clefCalls に、タイトル用の通信は titles に記録するモック。
 * タイトル用の応答は title.reply で差し替える（Response を返すか、throw する）。
 */
const mockAi = (clef: (request: ClefRequest) => Promise<ClefResponse> | ClefResponse) => {
  const clefCalls: { model: string; state: string }[] = []
  const titles: TitleCall[] = []
  const title = { reply: (): Response | Promise<Response> => titleReply('ハロウィン名刺') }
  const run = async (model: string, request: unknown) => {
    const parsed = ClefRequestSchema.safeParse(request)
    if (!parsed.success) throw new Error('Unexpected Clef request shape')
    clefCalls.push({ model, state: parsed.data.state })
    return clef(parsed.data)
  }
  const fetcher: TitleFetcher = async (url, init) => {
    const body = TitleRequestSchema.safeParse(JSON.parse(String(init.body)))
    if (!body.success) throw new Error('Unexpected title request shape')
    titles.push({ url, headers: Object.fromEntries(new Headers(init.headers).entries()), body: body.data })
    return title.reply()
  }
  return { run, fetcher, clefCalls, titles, title }
}

/** 実通信の安全網。タイトルの通信は titleFetcher を通るので、globalThis.fetch が呼ばれたらテストを落とす */
const forbidRealFetch = () =>
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async () => {
        throw new Error('Real network access is forbidden in tests')
      },
      { preconnect: () => {} }
    )
  )

const migrate = async (DB: D1Database) => {
  const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const name of migrations)
    await DB.exec(
      (await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ')
    )
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
        body: JSON.stringify({ model: 'clef-flash', fieldThresholds: resolveFieldThresholds(0.9) })
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
    expect(ai.titles).toHaveLength(1)
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
    // 保留・無視・手動の登録・通知の再送・保存済みの判定の再利用では、タイトル用の呼び出しは一度も増えない
    expect(ai.titles).toHaveLength(1)
    delivery.mode = 'ai_failure'
    const failedPost = { ...post, id: '2109221721773576394', url: 'https://x.com/bic_akiba/status/2109221721773576394' }
    await insertWebhookJob(env, failedPost)
    await expect(proceed(failedPost.id)).rejects.toThrow('synthetic AI failure')
    expect((await getWebhookJob(env, failedPost.id)).status).toBe('failed')
    expect((await getWebhookJob(env, failedPost.id)).lastError).toBe('processing_failed')
    delivery.mode = 'sent'
    await retryWebhookJob(env, failedPost.id, { notificationOnly: false, allowUnknown: false })
    await proceed(failedPost.id)
    expect((await getWebhookJob(env, failedPost.id)).status).toBe('held')
    expect(await DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(2)
    await DB.prepare("UPDATE webhook_event_candidates SET status='failed' WHERE post_id=?").bind(failedPost.id).run()
    await retryWebhookJob(env, failedPost.id, { notificationOnly: false, allowUnknown: false })
    const cachedCalls = ai.clefCalls.length
    const cachedModel = (await getWebhookJob(env, failedPost.id)).model
    const cachedGet = spyOn(env.BICCAME_MUSUME_EVENTS, 'get').mockImplementation(async () => {
      throw new Error('KV must not be read for saved result retry')
    })
    try {
      await proceed(failedPost.id)
      expect(ai.clefCalls).toHaveLength(cachedCalls)
      expect(cachedGet).not.toHaveBeenCalled()
      expect((await getWebhookJob(env, failedPost.id)).model).toBe(cachedModel)
      expect(ai.titles).toHaveLength(1)
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

test('saved field thresholds reach the judgement: the status threshold decides whether a 0.6 status is confirmed', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-process-field-thresholds-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB'],
      kvNamespaces: ['BICCAME_MUSUME_EVENTS']
    })
  )
  // Discord へは送らない。通知は常に成功した扱いにする。
  const notificationSpy = spyOn(discordService, 'notifyEventDetection').mockImplementation(async () => ({
    status: 'sent',
    messageId: '1234567890'
  }))
  try {
    const environment = await mf.getBindings<Bindings>()
    const env = Object.assign(environment, {
      ENVIRONMENT: 'local',
      EVENT_DETECTION_QUEUE: { send: async () => {} },
      AI: {
        // 状態（開始）は 0.6、開始日は 0.7 に止まる回答。他の項目は 0.99 で確定する。
        // 開始日が常に未確定なので、どの条件でも保留のまま（登録まで進まず、理由の差だけで判定を見る）。
        run: async (_model: string, request: ClefRequest): Promise<ClefResponse> => {
          const base = responseFor(request)
          const startDate = base.answers.start_date
          if (startDate?.type !== 'choice') throw new Error('Missing start_date answer')
          return {
            answers: {
              ...base.answers,
              status: { type: 'choice', choice: 'start', probabilities: { start: 0.6, announce: 0.3 } },
              start_date: {
                type: 'choice',
                choice: startDate.choice,
                probabilities: { [startDate.choice]: 0.7, none: 0.2 }
              }
            }
          }
        }
      }
    })
    const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations)
      await env.DB.exec(
        (await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ')
      )
    const postOf = (day: number): DetectPost => ({
      id: `21092217217735764${day}0`,
      screenName: 'bic_akiba',
      text: `10月${day}日より限定名刺をどなたでも配布します`,
      createdAt: '2026-10-11T00:00:00Z',
      kind: 'original',
      url: `https://x.com/bic_akiba/status/21092217217735764${day}0`,
      media: []
    })
    const judge = async (post: DetectPost) => {
      await insertWebhookJob(env, post)
      await processWebhookJob(env, post.id)
      return getWebhookJob(env, post.id)
    }
    const saveThresholds = async (status: number) => {
      const response = await botRoutes.request(
        '/admin/bot/configuration',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'clef', fieldThresholds: { ...resolveFieldThresholds(0.9), status } })
        },
        env
      )
      expect(response.status).toBe(200)
    }
    // 未保存: status の既定のしきい値は 0.8 なので、0.6 は告知・開始と確定できない。
    const byDefault = await judge(postOf(12))
    expect(byDefault.status).toBe('held')
    expect(byDefault.reasons).toEqual(['not_new_event_announcement', 'start_date_unconfirmed'])
    // status を 0.5 に下げて保存すると、同じ回答でも status は確定し、理由から消える。
    await saveThresholds(0.5)
    const lowered = await judge(postOf(13))
    expect(lowered.status).toBe('held')
    expect(lowered.reasons).toEqual(['start_date_unconfirmed'])
    // 0.7 に上げて保存し直すと、また未確定に戻る（保存値が毎回読まれる）。
    await saveThresholds(0.7)
    const raised = await judge(postOf(14))
    expect(raised.reasons).toEqual(['not_new_event_announcement', 'start_date_unconfirmed'])
  } finally {
    notificationSpy.mockRestore()
    await mf.dispose()
  }
}, 60000)

/**
 * タイトル用のテストの共通の準備。Discord へは送らず、D1 は空のまま使う。
 * secrets=false なら ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN を env に入れない（未登録の環境）。
 * 実通信はしない: タイトルの通信は titleFetcher のモック、Clef は env.AI のモックで、globalThis.fetch は呼ばれたら落とす。
 */
const titleHarness = async (name: string, options: { secrets?: boolean } = {}) => {
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
  const ai = mockAi((request) => responseFor(request))
  const fetchGuard = forbidRealFetch()
  const notificationSpy = spyOn(discordService, 'notifyEventDetection').mockImplementation(async () => ({
    status: 'sent',
    messageId: '1234567890'
  }))
  const environment = await mf.getBindings<Bindings>()
  const env = Object.assign(environment, {
    ENVIRONMENT: 'local',
    EVENT_DETECTION_QUEUE: { send: async () => {} },
    AI: { run: ai.run },
    ...(options.secrets === false ? {} : { ANTHROPIC_BASE_URL: TITLE_BASE_URL, ANTHROPIC_AUTH_TOKEN: TITLE_TOKEN })
  })
  // 通知の組み立てが読む getEvent は Prisma（wasm）を使うので、D1 の題を返す代わりのものに差し替える
  const getEventSpy = spyOn(eventService, 'getEvent').mockImplementation(async (_env, id) => {
    const parsed = EventDetailSchema.safeParse({
      uuid: id,
      category: 'limited_card',
      title: await env.DB.prepare('SELECT title FROM events WHERE id=?').bind(id).first<string>('title'),
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
  await migrate(env.DB)
  // 投稿は店舗アカウント（アキバ）。day 日開始の限定名刺の告知で、日ごとに別イベントになる
  const postOf = (day: number, text = `10月${day}日より限定名刺をどなたでも配布します`): DetectPost => ({
    id: `21092217217735765${String(day).padStart(2, '0')}`,
    screenName: 'bic_akiba',
    text,
    createdAt: '2026-10-11T00:00:00Z',
    kind: 'original',
    url: `https://x.com/bic_akiba/status/21092217217735765${String(day).padStart(2, '0')}`,
    media: []
  })
  const run = async (post: DetectPost) => {
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, { titleFetcher: ai.fetcher })
    const job = await getWebhookJob(env, post.id)
    const title =
      job.eventId === null
        ? null
        : await env.DB.prepare('SELECT title FROM events WHERE id=?').bind(job.eventId).first<string>('title')
    return { job, title }
  }
  const dispose = async () => {
    getEventSpy.mockRestore()
    notificationSpy.mockRestore()
    fetchGuard.mockRestore()
    await mf.dispose()
  }
  return { env, ai, postOf, run, dispose }
}

/** evaluateDetection が付ける今の形のタイトル（タイトルを作れないときに登録される題） */
const DEFAULT_TITLE = 'アキバたん 限定名刺配布'

const titleToolInput = (title: string) => () => titleReply(title)

test('automatic registration falls back to the current title and still registers when the title request fails or is unusable', async () => {
  const harness = await titleHarness('webhook-title-fallback-test')
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const { ai, postOf, run } = harness
    // 失敗の形と検査違反。どれも登録は成功し、題は今の形のまま、理由に title_fallback が付く。
    const failures: [string, () => Response | Promise<Response>][] = [
      ['HTTP 429', () => new Response('{"error":"rate_limited"}', { status: 429 })],
      ['HTTP 500', () => new Response('{"error":"internal"}', { status: 500 })],
      ['HTTP 401', () => new Response('{"error":"unauthorized"}', { status: 401 })],
      ['通信エラー', () => Promise.reject(new TypeError('synthetic network failure'))],
      ['JSON でない応答', () => new Response('not json', { status: 200 })],
      ['tool_use が無い', () => Response.json({ content: [{ type: 'text', text: '題は「ハロウィン名刺」です' }] })],
      ['content が無い', () => Response.json({ type: 'message' })],
      ['title が文字列でない', () => toolReply({ title: 3 })],
      ['title が空', () => toolReply({ title: '' })],
      ['input に title が無い', () => toolReply({ name: 'ハロウィン名刺' })],
      ['キャラ名入り', titleToolInput('アキバたんのハロウィン名刺')],
      ['店舗名入り', titleToolInput('AKIBA店ハロウィン名刺')],
      ['括弧入り', titleToolInput('ハロウィン名刺（限定）')],
      ['31 文字', titleToolInput('あ'.repeat(31))],
      ['説明語入り', titleToolInput('ハロウィン名刺配布')],
      ['複数行', titleToolInput('ハロウィン\n名刺')]
    ]
    for (const [index, [label, reply]] of failures.entries()) {
      ai.title.reply = reply
      const before = ai.titles.length
      const { job, title } = await run(postOf(12 + index))
      expect(job.status, label).toBe('registered')
      // 通信は 1 回だけ（再試行しない）
      expect(ai.titles, label).toHaveLength(before + 1)
      expect(title, label).toBe(DEFAULT_TITLE)
      expect(job.candidate?.title, label).toBe(DEFAULT_TITLE)
      expect(job.reasons, label).toContain('title_fallback')
      expect(job.reasons, label).not.toContain('title_generated')
    }
    // 理由の種類だけを警告に出し、本文・題・トークン・エラー本文は出さない
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('falling back to the default title')
    for (const secret of ['限定名刺をどなたでも', 'synthetic network failure', TITLE_TOKEN, 'anthropic.example.test'])
      expect(logged, secret).not.toContain(secret)
    // 直った後は同じ流れで題が付く
    ai.title.reply = titleToolInput('夏名刺')
    const recovered = await run(postOf(12 + failures.length))
    expect(recovered.title).toBe('夏名刺')
    expect(recovered.job.reasons).toContain('title_generated')
  } finally {
    warn.mockRestore()
    await harness.dispose()
  }
}, 120000)

test('without ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN nothing is sent and registration still succeeds with the current title', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    // 両方未登録、片方だけ未登録、空文字はどれも未設定として扱う（登録前のステージング・本番でも登録は止まらない）
    const cases: [string, Record<string, string>][] = [
      ['どちらも未登録', {}],
      ['URL だけ未登録', { ANTHROPIC_AUTH_TOKEN: TITLE_TOKEN }],
      ['トークンだけ未登録', { ANTHROPIC_BASE_URL: TITLE_BASE_URL }],
      ['空文字', { ANTHROPIC_BASE_URL: '', ANTHROPIC_AUTH_TOKEN: '' }]
    ]
    for (const [index, [label, secrets]] of cases.entries()) {
      const harness = await titleHarness(`webhook-title-not-configured-test-${index}`, { secrets: false })
      try {
        Object.assign(harness.env, secrets)
        const { job, title } = await harness.run(harness.postOf(12))
        expect(job.status, label).toBe('registered')
        expect(title, label).toBe(DEFAULT_TITLE)
        expect(job.reasons, label).toContain('title_fallback')
        // タイトル用の通信は一度も行われない
        expect(harness.ai.titles, label).toHaveLength(0)
        // Clef の判定は通常どおり行われる
        expect(harness.ai.clefCalls, label).toHaveLength(1)
        expect(
          warn.mock.calls.map((call) => String(call[0])),
          label
        ).toContain('Title generation is not configured')
      } finally {
        await harness.dispose()
      }
    }
  } finally {
    warn.mockRestore()
  }
}, 120000)

test('held and ignored jobs never send a title request, even when an admin registers the held one by hand', async () => {
  const harness = await titleHarness('webhook-title-skipped-test')
  try {
    const { ai, postOf, run } = harness
    // 保留（開始日が書かれていない投稿）
    const held = await run(postOf(20, '限定名刺をどなたでも配布します'))
    expect(held.job.status).toBe('held')
    // 無視（キーワードの無い投稿）
    const ignored = await run(postOf(21, 'こんにちは'))
    expect(ignored.job.status).toBe('ignored')
    // Clef は呼ばれるが、タイトル用の通信は一度も無い
    expect(ai.clefCalls).toHaveLength(2)
    expect(ai.titles).toHaveLength(0)
    for (const job of [held.job, ignored.job]) {
      expect(job.reasons).not.toContain('title_generated')
      expect(job.reasons).not.toContain('title_fallback')
    }
    // 保留のまま管理画面で補完して登録しても（人が編集）、タイトル用の通信は無い
    expect(held.job.candidate).toBeNull()
    const manual = {
      category: 'limited_card' as const,
      title: '手入力の名刺',
      stores: ['akiba' as const],
      startDate: '2026-10-20T00:00:00+09:00',
      referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce' as const, url: held.job.sourceUrl }],
      conditions: [{ uuid: crypto.randomUUID(), type: 'everyone' as const }],
      isPreliminary: false,
      isVerified: true,
      shouldTweet: false,
      uuid: held.job.eventUUID
    }
    await resolveWebhookJob(harness.env, held.job.postId, { action: 'register', event: manual })
    await processWebhookJob(harness.env, held.job.postId, { titleFetcher: ai.fetcher })
    expect(await harness.env.DB.prepare('SELECT title FROM events').first<string>('title')).toBe('手入力の名刺')
    expect(ai.titles).toHaveLength(0)
  } finally {
    await harness.dispose()
  }
}, 60000)

test('the title request has the right URL, headers, model and tool, and carries the D1 examples and the forbidden words; an empty D1 still generates', async () => {
  const harness = await titleHarness('webhook-title-prompt-test')
  try {
    const { env, ai, postOf, run } = harness
    // D1 に何も無い（イベント 0 件）→ 失敗扱いにせず、空の手本で生成する（この方針をここで固定する）
    const first = await run(postOf(12))
    expect(first.title).toBe('ハロウィン名刺')
    expect(first.job.reasons).toContain('title_generated')
    expect(ai.titles).toHaveLength(1)
    expect(ai.titles[0].body.system).toBe(
      titleSystem({ top: [], byCategory: { limited_card: [], regular_card: [], ackey: [], other: [] } })
    )
    // D1 に手本を入れる（登録の重複にならないよう、店舗なし。規則に合わない古い登録も混ぜる）
    const now = '2026-10-01 00:00:00'
    const insert = env.DB.prepare(
      'INSERT INTO events (id,category,title,start_date,is_verified,is_preliminary,created_at,updated_at) VALUES (?,?,?,?,1,0,?,?)'
    )
    const examples: [string, string][] = [
      ['缶バッジで繋ぐビッカメ娘旅', 'other'],
      ['缶バッジで繋ぐビッカメ娘旅', 'other'],
      ['誕生日限定名刺', 'limited_card'],
      ['1月限定名刺配布開始', 'limited_card'],
      ['新東たんの名刺', 'limited_card'],
      ['ハロウィン名刺（アキバたん）', 'limited_card']
    ]
    await env.DB.batch(
      examples.map(([title, category]) => insert.bind(crypto.randomUUID(), category, title, now, now, now))
    )
    const post = postOf(13)
    const second = await run(post)
    expect(second.job.status).toBe('registered')
    expect(ai.titles).toHaveLength(2)
    const call = ai.titles[1]
    // 宛先とヘッダ（Authorization と x-api-key の両方。末尾のスラッシュは除く）
    expect(call.url).toBe('https://anthropic.example.test/v1/messages')
    expect(call.headers['content-type']).toBe('application/json')
    expect(call.headers['anthropic-version']).toBe('2023-06-01')
    expect(call.headers.authorization).toBe(`Bearer ${TITLE_TOKEN}`)
    expect(call.headers['x-api-key']).toBe(TITLE_TOKEN)
    // モデル・トークン上限・answer ツール・tool_choice（CLI の callTool と同じ形）
    expect(call.body.model).toBe(TITLE_MODEL)
    expect(TITLE_MODEL).toBe('claude-haiku-5-5')
    expect(call.body.max_tokens).toBe(TITLE_MAX_TOKENS)
    expect(call.body.tool_choice).toEqual({ type: 'auto' })
    expect(call.body.tools).toEqual([
      {
        name: 'answer',
        description: '質問への回答を返す',
        input_schema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'このイベントのタイトル。規則に沿った短い名詞句だけを入れる（説明や括弧は付けない）'
            }
          },
          required: ['title'],
          additionalProperties: false
        }
      }
    ])
    // system: CLI と同じ命名の指示 + D1 の手本（規則に合うものだけ。件数つき）。入れてはいけない語ではなく手本の題が入る
    const { system } = call.body
    expect(system).toContain('命名の規則:')
    expect(system).toContain('- 缶バッジで繋ぐビッカメ娘旅（2）')
    expect(system).toContain('- 誕生日限定名刺（1）')
    expect(system).toContain(
      '- other（アクスタ・缶バッジ・ステッカー・ポストカードなど名刺とアクキー以外）: 缶バッジで繋ぐビッカメ娘旅'
    )
    for (const bad of ['1月限定名刺配布開始', '新東たんの名刺', 'ハロウィン名刺（アキバたん）'])
      expect(system, bad).not.toContain(bad)
    for (const term of ['アキバたん', 'AKIBA店']) expect(system, term).not.toContain(term)
    // user の state: この店舗のキャラ名・店舗名（入れてはいけない語）・カテゴリ・開始日・投稿本文
    const [message] = call.body.messages
    expect(message.content).toContain('入れてはいけない語（この店舗のキャラ名・店舗名）:')
    for (const term of ['アキバたん', 'AKIBA店']) expect(message.content, term).toContain(term)
    expect(message.content).toContain('カテゴリ: limited_card（期間限定・数量限定・記念の名刺）')
    expect(message.content).toContain('開始日: 2026-10-13（10月）')
    expect(message.content).toContain(`投稿本文:\n${post.text}`)
  } finally {
    await harness.dispose()
  }
}, 60000)
