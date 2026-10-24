import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import dayjs from 'dayjs'
import { z } from 'zod'
import { type D1GoldLedger, openD1GoldLedger } from './d1-gold-ledger'
import { type GoldCase, goldModelPost } from './d1-gold-schema'
import { createGoalModelClient } from './goal-pipeline-client'
import { type GoalPipelineModule, goalHash } from './goal-pipeline-module'
import { GOAL_PIPELINE_PROFILE } from './goal-pipeline-profile'
import { runGoalPipeline } from './goal-pipeline-run'
import { type GoalPipelineResult, GoalPipelineResultSchema } from './goal-pipeline-schema'

// 通信系の失敗は全体を止めて再開できるようにする（前回の測定と同じ分類）。
export const TRANSPORT_ERROR_PATTERN =
  /HTTP \d{3}|Evaluation transport failure|Invalid (?:evaluation JSON|Clef evaluation) response|not configured|network|fetch|timeout|aborted/i
// 同じ投稿の通信失敗は3回まで。3回目の失敗でその投稿はエラーとして記録し、以後は再送せず次の投稿へ進む。
export const D1_GOLD_MAX_TRIES = 3
export const D1_GOLD_MAX_CONCURRENCY = 2

export class D1GoldBudgetError extends Error {}

export const ErrorRecordSchema = z.object({
  kind: z.enum(['transport', 'validation', 'budget', 'interrupted']),
  message: z.string().nonempty(),
  calls: z.number().int().nonnegative(),
  at: z.iso.datetime()
})
export type ErrorRecord = z.infer<typeof ErrorRecordSchema>

export const casePaths = (directory: string, caseId: string) => {
  const root = join(directory, 'cases', caseId)
  return {
    root,
    result: join(root, 'result.json'),
    inflight: join(root, 'inflight.json'),
    input: join(root, 'input.json')
  }
}

const numbered = (names: readonly string[], prefix: string) =>
  names.filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.json'))

export type CaseState = { result: GoalPipelineResult | null; errors: ErrorRecord[]; sequence: number }

// 保存済みの結果と失敗記録を読む。結果が無いまま残った inflight は、中断された試行として扱う。
// persist が真のときだけ、その中断を失敗記録としてファイルへ書く（採点側は読むだけ）。
export const loadCaseState = async (
  directory: string,
  sample: GoldCase,
  module: GoalPipelineModule,
  persist: boolean
) => {
  const paths = casePaths(directory, sample.caseId)
  if (persist) await mkdir(paths.root, { recursive: true, mode: 0o700 })
  const names: string[] = await readdir(paths.root).catch((): string[] => [])
  const sequence = numbered(names, 'call').length
  const errors = await Promise.all(
    numbered(names, 'error').map(async (name) => {
      const parsed = ErrorRecordSchema.safeParse(JSON.parse(await readFile(join(paths.root, name), 'utf8')))
      if (!parsed.success) throw new Error('Invalid D1 gold error record')
      return { name, record: parsed.data }
    })
  )
  const ordered = errors.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })).map((e) => e.record)
  if (names.includes('result.json')) {
    const result = GoalPipelineResultSchema.safeParse(JSON.parse(await readFile(paths.result, 'utf8')))
    if (
      !result.success ||
      result.data.inputHash !== goalHash(goldModelPost(sample)) ||
      result.data.version !== module.DETECTION_VERSION
    )
      throw new Error('Invalid completed D1 gold checkpoint')
    return { result: result.data, errors: ordered, sequence } satisfies CaseState
  }
  if (names.includes('inflight.json')) {
    const record: ErrorRecord = {
      kind: 'interrupted',
      message: 'Previous run stopped mid-post',
      calls: 0,
      at: dayjs().toISOString()
    }
    if (persist) {
      await writeFile(join(paths.root, `error-${ordered.length + 1}.json`), JSON.stringify(record), {
        mode: 0o600,
        flag: 'wx'
      })
      await unlink(paths.inflight)
    }
    return { result: null, errors: [...ordered, record], sequence } satisfies CaseState
  }
  return { result: null, errors: ordered, sequence } satisfies CaseState
}

// 再送してよいのは、通信・中断・予算切れで終わった投稿だけ。応答の検証失敗は再試行しない。
export const isRetryable = (state: CaseState) =>
  state.result === null &&
  state.errors.every((error) => error.kind !== 'validation') &&
  state.errors.filter((error) => error.kind !== 'budget').length < D1_GOLD_MAX_TRIES

const classify = (client: unknown, final: unknown): ErrorRecord['kind'] => {
  const cause = client === null ? final : client
  const message = cause instanceof Error ? cause.message : String(cause)
  if (cause instanceof D1GoldBudgetError) return 'budget'
  return TRANSPORT_ERROR_PATTERN.test(message) ? 'transport' : 'validation'
}

export type D1GoldClientFactory = typeof createGoalModelClient
export type D1GoldRunOptions = {
  module: GoalPipelineModule
  cases: readonly GoldCase[]
  directory: string
  maxCalls: number
  maxSeconds: number
  decideEndpoint: string
  extractionEndpoint: string
  concurrency?: number
  createClient?: D1GoldClientFactory
  // 台帳の上限の天井。既定は通常の測定の上限。分割した検証用の測定だけが引き上げた天井を渡す。
  callCeiling?: number
}

export const runGoldCohort = async (options: D1GoldRunOptions) => {
  const concurrency = options.concurrency === undefined ? D1_GOLD_MAX_CONCURRENCY : options.concurrency
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > D1_GOLD_MAX_CONCURRENCY)
    throw new Error('Invalid D1 gold concurrency')
  if (!Number.isFinite(options.maxSeconds) || options.maxSeconds < 1 || options.maxSeconds > 7200)
    throw new Error('Invalid D1 gold deadline')
  const createClient = options.createClient === undefined ? createGoalModelClient : options.createClient
  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  const ledger = await openD1GoldLedger(options.directory, options.maxCalls, options.callCeiling)
  try {
    return await runLocked(options, ledger, createClient, concurrency)
  } finally {
    await ledger.close()
  }
}

const runLocked = async (
  options: D1GoldRunOptions,
  ledger: D1GoldLedger,
  createClient: D1GoldClientFactory,
  concurrency: number
) => {
  const manifest = {
    moduleSha256: options.module.sha256,
    version: options.module.DETECTION_VERSION,
    profile: GOAL_PIPELINE_PROFILE,
    profileHash: goalHash(GOAL_PIPELINE_PROFILE),
    caseIds: options.cases.map((sample) => sample.caseId)
  }
  const manifestPath = join(options.directory, 'manifest.json')
  if (await Bun.file(manifestPath).exists()) {
    if (goalHash(JSON.parse(await readFile(manifestPath, 'utf8'))) !== goalHash(manifest))
      throw new Error('D1 gold cohort changed')
  } else await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  const states = new Map<string, CaseState>(
    await Promise.all(
      options.cases.map(
        async (sample) => [sample.caseId, await loadCaseState(options.directory, sample, options.module, true)] as const
      )
    )
  )
  const pending = options.cases.filter((sample) => {
    const state = states.get(sample.caseId)
    return state !== undefined && state.result === null && isRetryable(state)
  })
  const start = performance.now()
  const progress: { halted: boolean; haltReason: string | null; finished: number } = {
    halted: false,
    haltReason: null,
    finished: 0
  }
  const execute = async (sample: GoldCase) => {
    const paths = casePaths(options.directory, sample.caseId)
    const state = states.get(sample.caseId)
    if (state === undefined) throw new Error('Missing D1 gold case state')
    const post = goldModelPost(sample)
    await writeFile(paths.input, `${JSON.stringify(post, null, 2)}\n`, { mode: 0o600 })
    await writeFile(paths.inflight, JSON.stringify({ startedAt: dayjs().toISOString() }), { mode: 0o600 })
    const attempt = { calls: 0, sequence: state.sequence }
    const seen: { clientError: unknown } = { clientError: null }
    const base = createClient({
      decideEndpoint: options.decideEndpoint,
      extractionEndpoint: options.extractionEndpoint,
      beforeCall: async (stage, body) => {
        if (ledger.remaining() < 1) throw new D1GoldBudgetError('D1 gold call budget exhausted')
        if (performance.now() - start > options.maxSeconds * 1000)
          throw new D1GoldBudgetError('D1 gold deadline exhausted')
        await ledger.reserve({
          stage,
          caseId: sample.caseId,
          inputHash: goalHash(body),
          moduleSha256: options.module.sha256
        })
        attempt.calls += 1
        attempt.sequence += 1
        await writeFile(
          join(paths.root, `call-${attempt.sequence}.json`),
          JSON.stringify({ stage, inputHash: goalHash(body), body }, null, 2),
          { mode: 0o600, flag: 'wx' }
        )
      },
      afterCall: async (stage, response) => {
        await writeFile(
          join(paths.root, `response-${attempt.sequence}.json`),
          JSON.stringify({ stage, responseHash: goalHash(response), response }, null, 2),
          { mode: 0o600, flag: 'wx' }
        )
      }
    })
    // 抽出モジュールが例外を包み直しても、通信・予算の失敗はクライアント側の原因で分類する。
    const client = {
      run: async (...args: Parameters<typeof base.run>) => {
        try {
          const response = await base.run(...args)
          seen.clientError = null
          return response
        } catch (error) {
          seen.clientError = error
          throw error
        }
      },
      extractionFetcher: async (...args: Parameters<typeof base.extractionFetcher>) => {
        try {
          const response = await base.extractionFetcher(...args)
          seen.clientError = null
          return response
        } catch (error) {
          seen.clientError = error
          throw error
        }
      }
    }
    try {
      const result = await runGoalPipeline({ module: options.module, post, ...client })
      if (result.calls !== attempt.calls) throw new Error('Pipeline call accounting mismatch')
      await writeFile(paths.result, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
      states.set(sample.caseId, { ...state, result, sequence: attempt.sequence })
    } catch (error) {
      const kind = classify(seen.clientError, error)
      const message = error instanceof Error ? error.message : 'Unknown pipeline error'
      const record = { kind, message, calls: attempt.calls, at: dayjs().toISOString() }
      await writeFile(join(paths.root, `error-${state.errors.length + 1}.json`), JSON.stringify(record), {
        mode: 0o600,
        flag: 'wx'
      })
      states.set(sample.caseId, { result: null, errors: [...state.errors, record], sequence: attempt.sequence })
      if (kind === 'transport' || kind === 'budget') {
        progress.halted = true
        progress.haltReason = `${kind}: ${message}`
      }
    } finally {
      await unlink(paths.inflight)
    }
    progress.finished += 1
    console.log(
      JSON.stringify({
        finished: progress.finished,
        pending: pending.length,
        calls: ledger.used(),
        halted: progress.halted
      })
    )
  }
  const worker = async (): Promise<void> => {
    if (progress.halted) return
    const sample = pending.shift()
    if (sample === undefined) return
    await execute(sample)
    await worker()
  }
  const total = pending.length
  await Promise.all(Array.from({ length: concurrency }, worker))
  const all = [...states.values()]
  const summary = {
    version: options.module.DETECTION_VERSION,
    moduleSha256: options.module.sha256,
    cases: options.cases.length,
    attemptedThisRun: total - pending.length,
    completed: all.filter((state) => state.result !== null).length,
    failed: all.filter((state) => state.result === null && !isRetryable(state)).length,
    retryable: all.filter((state) => state.result === null && isRetryable(state)).length,
    calls: ledger.used(),
    callLimit: ledger.limit,
    halted: progress.halted,
    haltReason: progress.haltReason,
    elapsedMs: Math.round(performance.now() - start),
    finishedAt: dayjs().toISOString()
  }
  await writeFile(join(options.directory, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 })
  return summary
}

// 採点側が使う読み取り。AIは呼ばない。
export const readCaseStates = async (directory: string, cases: readonly GoldCase[], module: GoalPipelineModule) =>
  new Map(
    await Promise.all(
      cases.map(async (sample) => [sample.caseId, await loadCaseState(directory, sample, module, false)] as const)
    )
  )
