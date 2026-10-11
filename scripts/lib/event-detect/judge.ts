import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ClefQuestion } from '@biccame/shared/event-detect/clef'
import type { Analysis, PostRow, StoreAccount } from './analysis'
import { QUESTION_VERSION } from './decide'
import { buildRequest } from './evaluate'
import { writeAtomic } from './store'

// 通過した投稿を Claude Haiku 5.5 で判定する。2026-10-08 の評価（正解 389 件）で一番よかった構成をそのまま使う:
// Clef と同じ state と質問（QUESTION_VERSION）、ツール 1 つの入力スキーマで回答を選択肢に制約し、
// 選択肢から外れた回答は作り直す。tool_choice の強制は Rialto 経由では使えない。
// 入力（state と質問）が完全に同じ投稿は 1 回だけ判定し、結果は入力のハッシュごとに保存する。

export const JUDGE_MODEL = 'claude-haiku-5-5'

const INSTRUCTIONS =
  '与えられた X の投稿（state）について、各質問に答えてください。noul 型の質問は「はい」である確率を 0〜1 の数値で、choice 型の質問は選択肢のキーを 1 つ返してください。answer ツールを必ず 1 回呼んでください。'

type JudgeRequest = ReturnType<typeof buildRequest>['request']

export type Judgement = {
  key: string
  model: string
  version: string
  /** 判定に使った投稿（同じ入力の投稿のうち最初のもの） */
  postId: string
  request: JudgeRequest
  endedCandidates: Record<string, string>
  answers: Record<string, number | string>
  attempts: number
  usage: { input_tokens: number; output_tokens: number }
  requestId: string | undefined
  elapsedMs: number
}

export const requestKey = (request: JudgeRequest) =>
  createHash('sha256')
    .update(JSON.stringify({ model: JUDGE_MODEL, version: QUESTION_VERSION, request }))
    .digest('hex')
    .slice(0, 32)

const toolSchema = (questions: Record<string, ClefQuestion>) => {
  const properties = Object.fromEntries(
    Object.entries(questions).map(([id, question]) => [
      id,
      question.type === 'noul'
        ? { type: 'number', minimum: 0, maximum: 1, description: `${question.instructions}（「はい」である確率 0〜1）` }
        : question.type === 'choice'
          ? {
              type: 'string',
              enum: Object.keys(question.criteria),
              description: `${question.instructions} 選択肢: ${JSON.stringify(question.criteria)}`
            }
          : { type: 'number', description: question.instructions }
    ])
  )
  return { type: 'object', properties, required: Object.keys(questions), additionalProperties: false }
}

/** 回答が質問の型と選択肢に合っているか。合わなければ理由を返す */
export const validateAnswers = (
  questions: Record<string, ClefQuestion>,
  answers: unknown
): Record<string, number | string> | string => {
  if (typeof answers !== 'object' || answers === null) return 'answers is not an object'
  const entries = new Map(Object.entries(answers))
  const result: Record<string, number | string> = {}
  for (const [id, question] of Object.entries(questions)) {
    const value = entries.get(id)
    if (question.type === 'choice') {
      if (typeof value !== 'string' || !(value in question.criteria)) return `bad choice ${id}=${String(value)}`
      result[id] = value
    } else {
      if (typeof value !== 'number' || value < 0 || value > 1) return `bad number ${id}=${String(value)}`
      result[id] = value
    }
  }
  return result
}

export type JudgeEndpoint = { url: string; token: string }

export const endpointFromEnv = (): JudgeEndpoint => {
  const base = process.env.ANTHROPIC_BASE_URL
  const token = process.env.ANTHROPIC_AUTH_TOKEN
  if (!base || !token) throw new Error('ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN are required')
  return { url: `${base.replace(/\/$/, '')}/v1/messages`, token }
}

export type CallStats = { rateLimited: number; serverErrors: number; invalid: number }

export const emptyStats = (): CallStats => ({ rateLimited: 0, serverErrors: 0, invalid: 0 })

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

export type ToolCall<T> = {
  system: string
  user: string
  /** ツール answer の入力スキーマ（JSON Schema） */
  schema: unknown
  /**
   * 回答を検証する。値そのものが文字列のこともあるので、成功と失敗は ok で区別する。
   * 失敗（ok: false）なら作り直させる
   */
  validate: (input: unknown) => Validated<T>
}

export type Validated<T> = { ok: true; value: T } | { ok: false; reason: string }

/** 「値または理由の文字列」を返す検証関数を Validated に包む。値がオブジェクトのときだけ使える */
export const fromObjectOrReason = <T extends object>(result: T | string): Validated<T> =>
  typeof result === 'string' ? { ok: false, reason: result } : { ok: true, value: result }

export type ToolResult<T> = {
  value: T
  attempts: number
  usage: { input_tokens: number; output_tokens: number }
  requestId: string | undefined
  elapsedMs: number
}

/**
 * Messages API で answer ツールを 1 回呼ばせ、その入力を回答として受け取る。
 * 429・5xx・通信エラー・検証エラーは待って作り直す。
 */
export const callTool = async <T>(
  endpoint: JudgeEndpoint,
  call: ToolCall<T>,
  stats: CallStats,
  attempt = 0
): Promise<ToolResult<T>> => {
  const started = performance.now()
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      Authorization: `Bearer ${endpoint.token}`,
      'x-api-key': endpoint.token
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 2048,
      system: call.system,
      messages: [{ role: 'user', content: call.user }],
      tools: [{ name: 'answer', description: '質問への回答を返す', input_schema: call.schema }],
      tool_choice: { type: 'auto' }
    }),
    signal: AbortSignal.timeout(300_000)
  }).catch((error: unknown) => error)
  const elapsedMs = Math.round(performance.now() - started)
  const retry = async (reason: string, delayMs: number) => {
    if (attempt >= 6) throw new Error(reason)
    // 同時に失敗したリクエストが同じ瞬間に再送しないようずらす
    await sleep(delayMs + Math.floor(Math.random() * 1000))
    return callTool(endpoint, call, stats, attempt + 1)
  }
  if (!(response instanceof Response)) return retry(`request failed: ${String(response)}`, 3000 * (attempt + 1))
  if (response.status === 429) {
    stats.rateLimited += 1
    const after = Number(response.headers.get('retry-after'))
    return retry('429', Number.isFinite(after) && after > 0 ? after * 1000 : 5000 * 2 ** attempt)
  }
  if (response.status >= 500) {
    stats.serverErrors += 1
    return retry(`${response.status}`, 3000 * (attempt + 1))
  }
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body).slice(0, 300)}`)
  const content = typeof body === 'object' && body !== null && 'content' in body ? body.content : undefined
  const tool = Array.isArray(content) ? content.find((item) => item?.type === 'tool_use') : undefined
  const validated = call.validate(tool?.input)
  if (!validated.ok) {
    stats.invalid += 1
    return retry(validated.reason, 1000)
  }
  const value = validated.value
  const usage = typeof body === 'object' && body !== null && 'usage' in body ? body.usage : undefined
  const tokens = (key: string) =>
    typeof usage === 'object' && usage !== null && key in usage ? Number(Reflect.get(usage, key)) : 0
  const requestId = response.headers.get('request-id')
  return {
    value,
    attempts: attempt + 1,
    usage: { input_tokens: tokens('input_tokens'), output_tokens: tokens('output_tokens') },
    requestId: requestId ? requestId : undefined,
    elapsedMs
  }
}

/** 質問 v1（Clef と同じ質問）で 1 件判定する */
const callOnce = async (endpoint: JudgeEndpoint, request: JudgeRequest, stats: CallStats) => {
  const result = await callTool(
    endpoint,
    {
      system: INSTRUCTIONS,
      user: request.state,
      schema: toolSchema(request.questions),
      validate: (input) => fromObjectOrReason(validateAnswers(request.questions, input))
    },
    stats
  )
  const { value, ...rest } = result
  return { answers: value, ...rest }
}

export type JudgeTarget = { key: string; row: PostRow; request: JudgeRequest; endedCandidates: Record<string, string> }

/**
 * 判定する入力の一覧。入力が同じ投稿は 1 件にまとめる。
 */
export const judgeTargets = (
  rows: readonly PostRow[],
  analysis: Analysis,
  accounts: readonly StoreAccount[],
  storeNames: Map<string, string[]>
): JudgeTarget[] => {
  const targets = new Map<string, JudgeTarget>()
  for (const row of rows) {
    const { request, endedCandidates } = buildRequest(row, analysis, accounts, storeNames)
    const key = requestKey(request)
    if (!targets.has(key)) targets.set(key, { key, row, request, endedCandidates })
  }
  return [...targets.values()]
}

export type JudgeProgress = {
  done: number
  total: number
  cached: number
  failed: number
  stats: CallStats
  inputTokens: number
  outputTokens: number
}

/**
 * 判定を流す。保存済みの入力は呼ばない。失敗した入力は数えて次へ進み、次回の実行で再試行される。
 */
export const runJudge = async (options: {
  targets: readonly JudgeTarget[]
  cacheDir: string
  concurrency: number
  endpoint: JudgeEndpoint
  onProgress?: (progress: JudgeProgress) => void
  onError?: (target: JudgeTarget, error: unknown) => void
}): Promise<JudgeProgress> => {
  await mkdir(options.cacheDir, { recursive: true })
  const progress: JudgeProgress = {
    done: 0,
    total: options.targets.length,
    cached: 0,
    failed: 0,
    stats: emptyStats(),
    inputTokens: 0,
    outputTokens: 0
  }
  const queue = { next: 0 }
  const worker = async () => {
    for (;;) {
      const target = options.targets[queue.next]
      queue.next += 1
      if (!target) return
      const path = resolve(options.cacheDir, `${target.key}.json`)
      if (existsSync(path)) progress.cached += 1
      else {
        try {
          const result = await callOnce(options.endpoint, target.request, progress.stats)
          const judgement: Judgement = {
            key: target.key,
            model: JUDGE_MODEL,
            version: QUESTION_VERSION,
            postId: target.row.post.id,
            request: target.request,
            endedCandidates: target.endedCandidates,
            ...result
          }
          await writeAtomic(path, JSON.stringify(judgement))
          progress.inputTokens += result.usage.input_tokens
          progress.outputTokens += result.usage.output_tokens
        } catch (error) {
          progress.failed += 1
          options.onError?.(target, error)
        }
      }
      progress.done += 1
      options.onProgress?.(progress)
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, worker))
  return progress
}

export const readJudgement = async (cacheDir: string, key: string): Promise<Judgement | undefined> => {
  const path = resolve(cacheDir, `${key}.json`)
  if (!existsSync(path)) return undefined
  return JSON.parse(await readFile(path, 'utf8'))
}
