import { expect, spyOn } from 'bun:test'
import * as discord from '@api/services/discord'
import { EVENT_DETECTION_MODEL_KEY } from '@api/services/webhook-config'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import type { Bindings } from '@api/types/bindings'
import { type ClefRequest, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { HTTPException } from 'hono/http-exception'
import { answer, fixture, makePost, migrate } from './webhook-multiple-events'

export { fixture, makePost, migrate } from './webhook-multiple-events'

/** 再確認で書き換わる列。これ以外の列は再確認の前後で一致しなければならない。 */
export const RECHECK_COLUMNS = [
  'answers_json',
  'model',
  'question_version',
  'confidence',
  'judged_at',
  'updated_at',
  'requests_json'
] as const

/** 確認用の再判定が AI に返させる、通常の判定とは違う is_event の確率（回答が新しくなったことの目印）。 */
export const RECHECKED_PROBABILITY = 0.8123

/**
 * 再確認の AI の挙動。ok 以外は失敗の種類（判定は 1 バッチなので、どれも 1 回の送信の応答が不正）。
 * incomplete は回答が 1 つ欠ける、wrong_type は store が質問と違う型（noul）、unknown_key は質問に無いキーが増える。
 */
export type RecheckMode = 'ok' | 'throw' | 'invalid' | 'incomplete' | 'wrong_type' | 'unknown_key'

/**
 * 再確認用のフェイク AI。実際の Workers AI は呼ばない。
 * 件数の質問と通常の質問は fixture の応答に任せ、is_event だけ RECHECKED_PROBABILITY にして新旧の回答を区別できるようにする。
 */
export const recheckAi = (base: { run: (model: string, raw: unknown) => Promise<unknown> }) => {
  const state: { mode: RecheckMode; calls: ClefRequest[]; armed: boolean } = { mode: 'ok', calls: [], armed: false }
  const run = async (model: string, raw: unknown) => {
    if (!state.armed) return base.run(model, raw)
    const request = ClefRequestSchema.safeParse(raw)
    if (!request.success) throw new Error('Invalid request')
    state.calls.push(request.data)
    if (state.mode === 'throw') throw new Error('Synthetic AI failure')
    if (state.mode === 'invalid') return { unexpected: true }
    const response = answer(request.data)
    if (state.mode === 'wrong_type') return { answers: { ...response.answers, store: { type: 'noul', noul: 0.99 } } }
    if (state.mode === 'unknown_key')
      return { answers: { ...response.answers, 'venue.akiba': { type: 'noul', noul: 0.99 } } }
    if (state.mode === 'incomplete') {
      const [first, ...rest] = Object.keys(response.answers)
      return { answers: Object.fromEntries(rest.map((key) => [key, response.answers[key]])), dropped: first }
    }
    return {
      answers: Object.fromEntries(
        Object.entries(response.answers).map(([key, value]) => [
          key,
          key === 'is_event' ? { type: 'noul', noul: RECHECKED_PROBABILITY } : value
        ])
      )
    }
  }
  return { state, run }
}

/** パイプライン（fixture の実 D1 とフェイク AI）で作った環境。通知・キュー・再確認の AI を観測できる。 */
export const recheckHarness = async (name: string) => {
  const base = await fixture(name)
  await migrate(base.env.DB)
  const sent: string[] = []
  const notifications: string[] = []
  const notification = spyOn(discord, 'notifyEventDetection').mockImplementation(async (_env, input) => {
    notifications.push(input.candidate?.item ? input.candidate.item : 'event')
    return { status: 'sent', messageId: '1234567890' }
  })
  const ai = recheckAi(base.env.AI)
  const env = Object.assign({}, base.env, {
    ENVIRONMENT: 'local',
    EVENT_DETECTION_QUEUE: {
      send: async (message: { postId: string }) => {
        sent.push(message.postId)
      }
    },
    AI: { run: ai.run }
  })
  const cleanup = async () => {
    notification.mockRestore()
    await base.cleanup()
  }
  return { env, ai, sent, notifications, cleanup }
}

export type RecheckEnv = Awaited<ReturnType<typeof recheckHarness>>['env']

const singleText = '本日から赤い限定名刺をどなたでも配布します。'

/** 1 配布物の投稿をパイプラインで自動登録する（reasons に manually_linked は付かない）。 */
export const registerSingle = async (env: RecheckEnv, id: string, text = singleText) => {
  const post = makePost(id, text)
  await insertWebhookJob(env, post)
  await processWebhookJob(env, post.id, {
    extractor: async () => ({
      events: [{ item: '赤い限定名刺', stores: ['akiba'], characterIds: [], evidence: [text] }]
    })
  })
  return post
}

const red = '本日から赤い限定名刺をどなたでも配布します。'
const blue = '本日から青い限定名刺をどなたでも配布します。'

/** 2 配布物の投稿をパイプラインで自動登録する。候補は 2 件とも registered。 */
export const registerPair = async (env: RecheckEnv, id: string) => {
  const post: DetectPost = makePost(id, `${red}\n${blue}`)
  await insertWebhookJob(env, post)
  await processWebhookJob(env, post.id, {
    extractor: async () => ({
      events: [
        { item: '赤い限定名刺', stores: ['akiba'], characterIds: [], evidence: [red] },
        { item: '青い限定名刺', stores: ['akiba'], characterIds: [], evidence: [blue] }
      ]
    })
  })
  return post
}

/** 再確認で別の設定のモデルが保存されることを見るため、判定モデルを KV に保存する。 */
export const saveModel = async (env: Bindings, model: 'clef' | 'clef-flash') => {
  await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, model)
}

type Row = Record<string, unknown>

export const rowOf = async (env: Bindings, table: string, column: string, id: string): Promise<Row> => {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE ${column}=?`).bind(id).first<Row>()
  if (row === null) throw new Error('Missing row')
  return row
}

/** 再確認で変わってよい列を除いた行。 */
export const unchangedColumns = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !RECHECK_COLUMNS.some((column) => column === key)))

/** webhook の 2 表と、プロンプト版の定義を除く、すべての表の中身。イベント本体や関連表が変わらないことを見る。 */
export const databaseSnapshot = async (env: Bindings) => {
  const excluded = new Set(['webhook_event_jobs', 'webhook_event_candidates', 'webhook_prompt_versions'])
  const tables = (
    await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'d1_migrations' ORDER BY name"
    ).all<{ name: string }>()
  ).results
    .map((table) => table.name)
    .filter((name) => !excluded.has(name))
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [table, (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results] as const)
    )
  )
}

export const statusOf = async (run: Promise<unknown>) => {
  try {
    await run
  } catch (error) {
    if (error instanceof HTTPException) return { status: error.status, message: error.message }
    throw error
  }
  throw new Error('Expected an HTTP error')
}

/** 失敗した再確認のあと、ジョブにも候補にもリースが残っていないこと。 */
export const expectNoLease = async (env: Bindings, postId: string) => {
  expect(await rowOf(env, 'webhook_event_jobs', 'post_id', postId)).toMatchObject({
    lease_token: null,
    lease_until: null
  })
  const leased = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM webhook_event_candidates WHERE post_id=? AND (lease_token IS NOT NULL OR lease_until IS NOT NULL)'
  )
    .bind(postId)
    .first<number>('total')
  expect(leased).toBe(0)
}

export { getWebhookJob }
