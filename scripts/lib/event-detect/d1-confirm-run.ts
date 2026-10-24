import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import dayjs from 'dayjs'
import { z } from 'zod'
import { type PlanItem, planSha256, sha256Of } from './d1-confirm-plan'
import { confirmQuestionsSha256 } from './d1-confirm-requests'
import { type D1GoldLedger, openD1GoldLedger } from './d1-gold-ledger'
import { createGoalModelClient } from './goal-pipeline-client'

// この測定専用の上限と並列数。既存の台帳（phase-live-attempts.jsonl・d1-gold の台帳）とは共有しない。
export const D1_CONFIRM_CALL_LIMIT = 300
export const D1_CONFIRM_MAX_CONCURRENCY = 2
// 同じ項目の失敗は3回まで（中断も1回に数える）。3回失敗した項目があれば、何も送らずに止まる。
export const D1_CONFIRM_MAX_TRIES = 3

export class ConfirmBudgetError extends Error {}

const ErrorKindSchema = z.enum(['transport', 'validation', 'budget', 'interrupted'])
export const ErrorRecordSchema = z.object({
  kind: ErrorKindSchema,
  message: z.string().nonempty(),
  durationMs: z.number().int().nonnegative(),
  at: z.iso.datetime()
})
export type ErrorRecord = z.infer<typeof ErrorRecordSchema>

export const ResultSchema = z.object({
  itemId: z.string().nonempty(),
  requestSha256: z.string().nonempty(),
  startedAt: z.iso.datetime(),
  durationMs: z.number().int().nonnegative(),
  response: ClefResponseSchema
})
export type ItemResult = z.infer<typeof ResultSchema>

export const itemPaths = (directory: string, itemId: string) => {
  const root = join(directory, 'items', itemId)
  return { root, result: join(root, 'result.json'), inflight: join(root, 'inflight.json') }
}

export type ItemState = { result: ItemResult | null; errors: ErrorRecord[]; sequence: number }

const numbered = (names: readonly string[], prefix: string) =>
  names.filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.json'))

// 保存済みの結果と失敗記録を読む。結果が無いまま残った inflight は中断された試行として、persist が真のときだけ失敗記録に書く。
export const loadItemState = async (directory: string, item: PlanItem, persist: boolean): Promise<ItemState> => {
  const paths = itemPaths(directory, item.itemId)
  if (persist) await mkdir(paths.root, { recursive: true, mode: 0o700 })
  const names: string[] = await readdir(paths.root).catch((): string[] => [])
  const sequence = numbered(names, 'call').length
  const errors = await Promise.all(
    numbered(names, 'error').map(async (name) => {
      const parsed = ErrorRecordSchema.safeParse(JSON.parse(await readFile(join(paths.root, name), 'utf8')))
      if (!parsed.success) throw new Error('Invalid confirm error record')
      return { name, record: parsed.data }
    })
  )
  const ordered = errors.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })).map((row) => row.record)
  if (names.includes('result.json')) {
    const result = ResultSchema.safeParse(JSON.parse(await readFile(paths.result, 'utf8')))
    if (!result.success || result.data.requestSha256 !== item.requestSha256)
      throw new Error('Invalid completed confirm result')
    return { result: result.data, errors: ordered, sequence }
  }
  if (names.includes('inflight.json')) {
    const record: ErrorRecord = {
      kind: 'interrupted',
      message: 'Previous run stopped mid-request',
      durationMs: 0,
      at: dayjs().toISOString()
    }
    if (persist) {
      await writeFile(join(paths.root, `error-${ordered.length + 1}.json`), JSON.stringify(record), {
        mode: 0o600,
        flag: 'wx'
      })
      await unlink(paths.inflight)
    }
    return { result: null, errors: [...ordered, record], sequence }
  }
  return { result: null, errors: ordered, sequence }
}

const failureCount = (state: ItemState) => state.errors.filter((error) => error.kind !== 'budget').length
// 再送してよいのは、通信・中断・予算切れで終わった項目だけ。検証の失敗は再送しない。
export const isRetryable = (state: ItemState) =>
  state.result === null &&
  state.errors.every((error) => error.kind !== 'validation') &&
  failureCount(state) < D1_CONFIRM_MAX_TRIES

// 再開してよい通信の失敗か。5xx・429・ネットワーク・期限・JSONでない応答だけ。4xx と検証の失敗は止めたままにする。
export const classifyError = (error: unknown): ErrorRecord['kind'] => {
  if (error instanceof ConfirmBudgetError) return 'budget'
  const message = error instanceof Error ? error.message : String(error)
  const status = /Evaluation endpoint returned HTTP (\d{3})/.exec(message)
  if (status !== null) return Number(status[1]) >= 500 || status[1] === '429' ? 'transport' : 'validation'
  return /Evaluation transport failure|Invalid evaluation JSON response/.test(message) ? 'transport' : 'validation'
}

export type ConfirmClientFactory = typeof createGoalModelClient
export type ConfirmRunOptions = {
  items: readonly PlanItem[]
  // 実行する項目。省略すると全項目。予備実行（パイロット）で先頭の候補だけに絞るときに使う。
  only?: ReadonlySet<string>
  directory: string
  maxCalls: number
  maxSeconds: number
  decideEndpoint: string
  extractionEndpoint: string
  concurrency?: number
  createClient?: ConfirmClientFactory
}

export const runConfirm = async (options: ConfirmRunOptions) => {
  const concurrency = options.concurrency === undefined ? D1_CONFIRM_MAX_CONCURRENCY : options.concurrency
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > D1_CONFIRM_MAX_CONCURRENCY)
    throw new Error('Invalid confirm concurrency')
  if (!Number.isFinite(options.maxSeconds) || options.maxSeconds < 1 || options.maxSeconds > 7200)
    throw new Error('Invalid confirm deadline')
  if (!Number.isInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > D1_CONFIRM_CALL_LIMIT)
    throw new Error('Invalid confirm call limit')
  const createClient = options.createClient === undefined ? createGoalModelClient : options.createClient
  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  // 排他ロックが残っていれば、台帳を開けずにここで例外になる（古いロックを消さずに止まる）。
  const ledger = await openD1GoldLedger(options.directory, options.maxCalls)
  try {
    return await runLocked(options, ledger, createClient, concurrency)
  } finally {
    await ledger.close()
  }
}

const runLocked = async (
  options: ConfirmRunOptions,
  ledger: D1GoldLedger,
  createClient: ConfirmClientFactory,
  concurrency: number
) => {
  const manifest = {
    planSha256: planSha256(options.items),
    questionsSha256: confirmQuestionsSha256,
    itemIds: options.items.map((item) => item.itemId)
  }
  const manifestPath = join(options.directory, 'manifest.json')
  if (await Bun.file(manifestPath).exists()) {
    if (sha256Of(JSON.parse(await readFile(manifestPath, 'utf8'))) !== sha256Of(manifest))
      throw new Error('Confirm plan changed')
  } else await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  const states = new Map<string, ItemState>(
    await Promise.all(
      options.items.map(async (item) => [item.itemId, await loadItemState(options.directory, item, true)] as const)
    )
  )
  const struck = options.items.filter((item) => {
    const state = states.get(item.itemId)
    return state !== undefined && state.result === null && failureCount(state) >= D1_CONFIRM_MAX_TRIES
  })
  const scope = options.items.filter((item) => options.only === undefined || options.only.has(item.itemId))
  const pending =
    struck.length > 0
      ? []
      : scope.filter((item) => {
          const state = states.get(item.itemId)
          return state !== undefined && state.result === null && isRetryable(state)
        })
  const start = performance.now()
  const progress: { halted: boolean; haltReason: string | null; finished: number } = {
    halted: struck.length > 0,
    haltReason:
      struck.length > 0 ? `strike: ${struck.length} item(s) already failed ${D1_CONFIRM_MAX_TRIES} times` : null,
    finished: 0
  }
  const execute = async (item: PlanItem) => {
    const paths = itemPaths(options.directory, item.itemId)
    const state = states.get(item.itemId)
    if (state === undefined) throw new Error('Missing confirm item state')
    await writeFile(paths.inflight, JSON.stringify({ startedAt: dayjs().toISOString() }), { mode: 0o600 })
    const attempt = { sequence: state.sequence }
    const startedAt = dayjs().toISOString()
    const timer = { from: performance.now() }
    const client = createClient({
      decideEndpoint: options.decideEndpoint,
      extractionEndpoint: options.extractionEndpoint,
      beforeCall: async (_stage, body) => {
        if (ledger.remaining() < 1) throw new ConfirmBudgetError('Confirm call budget exhausted')
        if (performance.now() - start > options.maxSeconds * 1000)
          throw new ConfirmBudgetError('Confirm deadline exhausted')
        await ledger.reserve({
          stage: 'confirm',
          caseId: item.itemId,
          inputHash: sha256Of(body),
          moduleSha256: confirmQuestionsSha256
        })
        attempt.sequence += 1
        timer.from = performance.now()
        await writeFile(
          join(paths.root, `call-${attempt.sequence}.json`),
          JSON.stringify({ inputHash: sha256Of(body), body }, null, 2),
          { mode: 0o600, flag: 'wx' }
        )
      },
      afterCall: async (_stage, response) => {
        await writeFile(
          join(paths.root, `response-${attempt.sequence}.json`),
          JSON.stringify({ responseHash: sha256Of(response), response }, null, 2),
          { mode: 0o600, flag: 'wx' }
        )
      }
    })
    try {
      const response = await client.run(item.request, 'judge')
      const result: ItemResult = {
        itemId: item.itemId,
        requestSha256: item.requestSha256,
        startedAt,
        durationMs: Math.round(performance.now() - timer.from),
        response
      }
      await writeFile(paths.result, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
      states.set(item.itemId, { ...state, result, sequence: attempt.sequence })
    } catch (error) {
      const kind = classifyError(error)
      const record: ErrorRecord = {
        kind,
        message: error instanceof Error ? error.message : 'Unknown confirm error',
        durationMs: Math.round(performance.now() - timer.from),
        at: dayjs().toISOString()
      }
      await writeFile(join(paths.root, `error-${state.errors.length + 1}.json`), JSON.stringify(record), {
        mode: 0o600,
        flag: 'wx'
      })
      states.set(item.itemId, { result: null, errors: [...state.errors, record], sequence: attempt.sequence })
      // 通信の失敗は、再開できる停止。それ以外（検証・予算・4xx）は、人が見るまで再開しない停止。
      progress.halted = true
      progress.haltReason = `${kind}: ${record.message}`
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
    const item = pending.shift()
    if (item === undefined) return
    await execute(item)
    await worker()
  }
  const total = pending.length
  await Promise.all(Array.from({ length: concurrency }, worker))
  const all = options.items.map((item) => states.get(item.itemId))
  const summary = {
    planSha256: manifest.planSha256,
    items: options.items.length,
    scope: scope.length,
    attemptedThisRun: total - pending.length,
    completed: all.filter((state) => state !== undefined && state.result !== null).length,
    failed: all.filter((state) => state !== undefined && state.result === null && !isRetryable(state)).length,
    retryable: all.filter((state) => state !== undefined && state.result === null && isRetryable(state)).length,
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

// 集計側が使う読み取り。AIは呼ばない。
export const readItemStates = async (directory: string, items: readonly PlanItem[]) =>
  new Map(
    await Promise.all(items.map(async (item) => [item.itemId, await loadItemState(directory, item, false)] as const))
  )
