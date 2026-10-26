import { expect, spyOn } from 'bun:test'
import * as discord from '@api/services/discord'
import {
  detectionConfiguration,
  EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
  EVENT_DETECTION_MODEL_KEY,
  EVENT_DETECTION_THRESHOLDS_KEY
} from '@api/services/webhook-config'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import type { Bindings } from '@api/types/bindings'
import { type ClefAnswer, type ClefRequest, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { resolveFieldThresholds } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { HTTPException } from 'hono/http-exception'
import type { AssociationPicks } from './webhook-answer'
import { answer, fixture, makePost, migrate } from './webhook-multiple-events'

export { getWebhookJob }

/** 自動登録済みの再実行で書き換わる列。これ以外の列は再実行の前後で一致しなければならない。 */
export const REJUDGED_COLUMNS = [
  'result_json',
  'answers_json',
  'model',
  'question_version',
  'confidence',
  'judged_at',
  'updated_at',
  'requests_json'
] as const

/** 再実行の AI が is_event に返す確率。回答が新しくなったことの目印（パイプラインの登録時は 0.99）。 */
export const REJUDGED_PROBABILITY = 0.8123

/**
 * 再実行の AI の挙動。ok 以外は失敗の種類（判定は 1 バッチなので、どれも 1 回の送信の応答が不正）。
 * incomplete は回答が 1 つ欠ける、wrong_type は store が質問と違う型（noul）、unknown_key は質問に無いキーが増える。
 */
export type RejudgeMode = 'ok' | 'throw' | 'invalid' | 'incomplete' | 'wrong_type' | 'unknown_key'

/** 回答のうち、選んだ選択肢（noul なら値）の確率だけを差し替える。ほかの選択肢の確率は変えない。 */
const withProbability = (value: ClefAnswer, probability: number): ClefAnswer =>
  value.type === 'choice'
    ? { ...value, probabilities: { ...value.probabilities, [value.choice]: probability } }
    : value.type === 'noul'
      ? { type: 'noul', noul: probability }
      : value

/**
 * 再実行用のフェイク AI。実際の Workers AI は呼ばない。armed になるまでは元のフェイク（通常の判定）に任せる。
 * armed 中は、全項目を高確度で答える回答のうち is_event を REJUDGED_PROBABILITY にして、新旧の回答を区別できるようにする。
 * probabilities は「質問のキー → 選んだ選択肢（確認の質問なら「はい」）の確率」で、しきい値の前後で結果が分かれる確率を作るために使う。
 * picks は store / character の質問で選ぶ選択肢（省略時は、その候補の抽出段階の店舗とアキバたん）。
 * 件数の質問（distribution_item_count）は常に元のフェイクに任せる。
 */
export const rejudgeAi = (base: { run: (model: string, raw: unknown) => Promise<unknown> }) => {
  const state: {
    mode: RejudgeMode
    calls: ClefRequest[]
    armed: boolean
    probabilities: Record<string, number>
    picks: AssociationPicks
  } = { mode: 'ok', calls: [], armed: false, probabilities: {}, picks: {} }
  const run = async (model: string, raw: unknown) => {
    const request = ClefRequestSchema.safeParse(raw)
    if (!request.success) throw new Error('Invalid request')
    if (!state.armed || request.data.questions.distribution_item_count !== undefined) return base.run(model, raw)
    state.calls.push(request.data)
    if (state.mode === 'throw') throw new Error('Synthetic AI failure')
    if (state.mode === 'invalid') return { unexpected: true }
    const response = answer(request.data, state.picks)
    if (state.mode === 'wrong_type') return { answers: { ...response.answers, store: { type: 'noul', noul: 0.99 } } }
    if (state.mode === 'unknown_key')
      return { answers: { ...response.answers, 'venue.akiba': { type: 'noul', noul: 0.99 } } }
    if (state.mode === 'incomplete') {
      const [first, ...rest] = Object.keys(response.answers)
      return { answers: Object.fromEntries(rest.map((key) => [key, response.answers[key]])), dropped: first }
    }
    return {
      answers: Object.fromEntries(
        Object.entries(response.answers).map(([key, value]) => {
          const probability = Object.hasOwn(state.probabilities, key) ? state.probabilities[key] : undefined
          if (probability !== undefined) return [key, withProbability(value, probability)]
          return [key, key === 'is_event' ? { type: 'noul', noul: REJUDGED_PROBABILITY } : value]
        })
      )
    }
  }
  return { state, run }
}

/** パイプライン（fixture の実 D1・KV とフェイク AI）で作った環境。通知・キュー・再実行の AI を観測できる。 */
export const rejudgeHarness = async (name: string) => {
  const base = await fixture(name)
  await migrate(base.env.DB)
  const sent: string[] = []
  const notifications: string[] = []
  const notification = spyOn(discord, 'notifyEventDetection').mockImplementation(async (_env, input) => {
    notifications.push(input.candidate?.item ? input.candidate.item : 'event')
    return { status: 'sent', messageId: '1234567890' }
  })
  const ai = rejudgeAi(base.env.AI)
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

export type RejudgeEnv = Awaited<ReturnType<typeof rejudgeHarness>>['env']

const singleText = '本日から赤い限定名刺をどなたでも配布します。'

/** 1 配布物の投稿をパイプラインで判定する。登録まで進めば自動登録済み（reasons に manually_linked は付かない）。 */
export const judgeSingle = async (env: RejudgeEnv, id: string, text = singleText) => {
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
export const registerPair = async (env: RejudgeEnv, id: string) => {
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

/** 判定モデルを KV に保存する。再実行で保存されるモデルが現在の設定になることを見る。 */
export const saveModel = async (env: Bindings, model: 'clef' | 'clef-flash') => {
  await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, model)
}

/** 項目別しきい値を KV に保存する。保存形式は全項目そろえる（8 項目が必須。足りないと既定値に戻る）。 */
export const saveFieldThresholds = async (
  env: Bindings,
  overrides: Parameters<typeof resolveFieldThresholds>[1],
  choiceThreshold = 0.9
) => {
  await env.BICCAME_MUSUME_EVENTS.put(
    EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
    JSON.stringify(resolveFieldThresholds(choiceThreshold, overrides))
  )
}

/** 登録・対象外・選択のしきい値（3 つ）を KV に保存する。 */
export const saveEventThresholds = async (
  env: Bindings,
  value: { eventThreshold: number; ignoreThreshold: number; choiceThreshold: number }
) => {
  await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_THRESHOLDS_KEY, JSON.stringify(value))
}

/**
 * 保存した設定が、実際に読み出される設定になっていること。KV の保存形式を誤ると既定値に戻るだけで、
 * 設定を変えたつもりのテストが誤った理由で通る（または落ちる）ため、再実行の前に必ず確かめる。
 */
export const expectConfiguration = async (
  env: Bindings,
  expected: {
    model?: string
    eventThreshold?: number
    ignoreThreshold?: number
    choiceThreshold?: number
    fieldThresholds?: Partial<Record<string, number>>
  }
) => {
  const { fieldThresholds, ...rest } = expected
  const configuration = await detectionConfiguration(env)
  expect(configuration).toMatchObject(rest)
  if (fieldThresholds !== undefined) expect(configuration.fieldThresholds).toMatchObject(fieldThresholds)
}

type Row = Record<string, unknown>

export const rowOf = async (env: Bindings, table: string, column: string, id: string): Promise<Row> => {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE ${column}=?`).bind(id).first<Row>()
  if (row === null) throw new Error('Missing row')
  return row
}

/** 再実行で変わってよい列を除いた行。 */
export const unchangedColumns = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !REJUDGED_COLUMNS.some((column) => column === key)))

/** 保存された判定結果（result_json）を読む。envelope は判定結果と発見記録（discovery）の組。 */
export const storedResult = (row: Row): { status: string; reasons: string[]; confidence: number; discovery: Row } => {
  const raw = row.result_json
  if (typeof raw !== 'string') throw new Error('Missing result_json')
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid result_json')
  const status = 'status' in parsed ? parsed.status : undefined
  const reasons = 'reasons' in parsed ? parsed.reasons : undefined
  const confidence = 'confidence' in parsed ? parsed.confidence : undefined
  const discovery = 'discovery' in parsed ? parsed.discovery : undefined
  if (
    typeof status !== 'string' ||
    !Array.isArray(reasons) ||
    typeof confidence !== 'number' ||
    typeof discovery !== 'object' ||
    discovery === null
  )
    throw new Error('Invalid result_json shape')
  return { status, reasons: reasons.map(String), confidence, discovery: Object.fromEntries(Object.entries(discovery)) }
}

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

/** 再実行のあと、ジョブにも候補にもリースが残っていないこと。 */
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
