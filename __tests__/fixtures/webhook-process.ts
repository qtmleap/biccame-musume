import { spyOn } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import * as discordService from '@api/services/discord'
import * as eventService from '@api/services/event-service'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import * as webhookProcessing from '@api/services/webhook-process'
import type { TitleFetcher } from '@api/services/webhook-title'
import type { Bindings } from '@api/types/bindings'
import type { ClefAnswer, ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { EventDetailSchema } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { z } from 'zod'
import { type AssociationPicks, associationAnswer, choiceAnswer } from './webhook-answer'

// 単一候補の回帰テストでは抽出を固定し、抽出通信は別のテストで検証する。
export const processWebhookJob = (env: Bindings, postId: string, options: { titleFetcher?: TitleFetcher } = {}) =>
  webhookProcessing.processWebhookJob(env, postId, {
    ...options,
    extractor: async (post) => ({
      // 抽出段階の開催店舗候補が無い候補は自動登録の保留規則（extraction_store_unspecified）で保留になるので、投稿元のアキバを入れる。
      events: [{ item: 'アキバたん 限定名刺配布', stores: ['akiba'], characterIds: [], evidence: [post.text] }]
    })
  })

/**
 * 全項目を高確度で答えるフェイクの回答。store / character は picks で選ぶ（省略時は、その候補の抽出段階の店舗とアキバたん）。
 * 選択肢に無い値を picks に指定すると例外にする。
 */
export const responseFor = (request: ClefRequest, picks: AssociationPicks = {}): ClefResponse => {
  const desired: Record<string, string> = {
    distribution_item_count: '1',
    status: 'start',
    category: 'limited_card',
    condition: 'everyone',
    end_date: 'none',
    quantity: 'none'
  }
  const answers: Record<string, ClefAnswer> = Object.fromEntries(
    Object.entries(request.questions).map(([id, question]) => {
      if (question.type === 'noul') return [id, { type: 'noul' as const, noul: 0.99 }]
      if (question.type === 'score') return [id, { type: 'score' as const, score: 1, confidence: 0.99 }]
      const choices = Object.keys(question.criteria)
      const association = associationAnswer(request, id, question, picks, 0.01 / (choices.length - 1))
      if (association !== undefined) return [id, association]
      const choice = desired[id] ? desired[id] : choices.find((key) => key !== 'none')
      if (!choice) throw new Error('No test choice')
      return [id, choiceAnswer(question, choice, 0.01 / (choices.length - 1))]
    })
  )
  return { answers }
}

// タイトル用の通信（Anthropic Messages）。実通信はせず、processWebhookJob に渡す titleFetcher のモックで受ける。
export const TITLE_BASE_URL = 'https://anthropic.example.test/'

export const TITLE_TOKEN = 'test-token-not-a-secret'

export const TitleRequestSchema = z.object({
  model: z.string().nonempty(),
  max_tokens: z.number().int().positive(),
  system: z.string().nonempty(),
  messages: z.tuple([z.object({ role: z.literal('user'), content: z.string().nonempty() })]),
  tools: z.array(
    z.object({ name: z.string().nonempty(), description: z.string().nonempty(), input_schema: z.unknown() })
  ),
  tool_choice: z.object({ type: z.string().nonempty() })
})

export type TitleCall = { url: string; headers: Record<string, string>; body: z.infer<typeof TitleRequestSchema> }

/** Anthropic Messages の応答。answer ツールの tool_use で題を返す（テキストの前置きつき） */
export const toolReply = (input: unknown) =>
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

export const titleReply = (title: string) => toolReply({ title })

/**
 * 候補の一般判定バッチは clefCalls に、タイトル用の通信は titles に記録する。キャラと件数の補助バッチは固定応答にする。
 * タイトル用の応答は title.reply で差し替える（Response を返すか、throw する）。
 */
export const mockAi = (clef: (request: ClefRequest) => Promise<ClefResponse> | ClefResponse) => {
  const clefCalls: { model: string; state: string }[] = []
  const titles: TitleCall[] = []
  const title = { reply: (): Response | Promise<Response> => titleReply('ハロウィン名刺') }
  const run = async (model: string, request: unknown) => {
    const parsed = ClefRequestSchema.safeParse(request)
    if (!parsed.success) throw new Error('Unexpected Clef request shape')
    if (parsed.data.questions.distribution_item_count || !parsed.data.questions.is_event)
      return responseFor(parsed.data)
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
export const forbidRealFetch = () =>
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async () => {
        throw new Error('Real network access is forbidden in tests')
      },
      { preconnect: () => {} }
    )
  )

export const migrate = async (DB: D1Database) => {
  const migrations = (await readdir('prisma/migrations', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const name of migrations)
    await DB.exec(
      (await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' ')
    )
}

/**
 * タイトル用のテストの共通の準備。Discord へは送らず、D1 は空のまま使う。
 * secrets=false なら ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN を env に入れない（未登録の環境）。
 * 実通信はしない: タイトルの通信は titleFetcher のモック、Clef は env.AI のモックで、globalThis.fetch は呼ばれたら落とす。
 */
export const titleHarness = async (name: string, options: { secrets?: boolean } = {}) => {
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
  // 非同期の初期化が終わる前にspyを登録せず、失敗時は一時Workerも片付ける。
  const environment = await (async () => {
    try {
      const bindings = await mf.getBindings<Bindings>()
      await migrate(bindings.DB)
      return bindings
    } catch (error) {
      await mf.dispose()
      throw error
    }
  })()
  const ai = mockAi((request) => responseFor(request))
  const fetchGuard = forbidRealFetch()
  const notificationSpy = spyOn(discordService, 'notifyEventDetection').mockImplementation(async () => ({
    status: 'sent',
    messageId: '1234567890'
  }))
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
export const DEFAULT_TITLE = 'アキバたん 限定名刺配布'

export const titleToolInput = (title: string) => () => titleReply(title)

/** 先に登録された投稿と同じ内容の別投稿（同じ店舗・種別・開始日・配布物）。登録の重複になり、保留になる */
export const duplicateOf = (post: DetectPost, suffix: string): DetectPost => ({
  ...post,
  id: `${post.id}${suffix}`,
  url: `${post.url}${suffix}`
})

/** 重複の保留の投稿が占めるスロット（semantic_key）の持ち主。先の投稿だけが持つ */
export const slotOwners = async (env: Bindings) =>
  (
    await env.DB.prepare('SELECT post_id AS postId FROM webhook_event_candidates WHERE semantic_key IS NOT NULL').all<{
      postId: string
    }>()
  ).results.map((row) => row.postId)
