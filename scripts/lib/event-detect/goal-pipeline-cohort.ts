import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { BenchmarkCase } from './benchmark-schema'
import { createGoalModelClient } from './goal-pipeline-client'
import { goalModelPost } from './goal-pipeline-input'
import { goalHash, type GoalPipelineModule } from './goal-pipeline-module'
import { runGoalPipeline } from './goal-pipeline-run'
import { GoalPipelineResultSchema } from './goal-pipeline-schema'
import { GOAL_PIPELINE_PROFILE } from './goal-pipeline-profile'
import { scoreGoalPipeline, summarizeGoalPipelines } from './goal-pipeline-score'
import type { GoalProofReader } from './goal-pipeline-operator'
import type { GoalPhaseAttempt } from './goal-pipeline-budget'

type CohortOptions = {
  module: GoalPipelineModule
  cases: BenchmarkCase[]
  directory: string
  maxCalls: number
  maxSeconds: number
  decideEndpoint: string
  extractionEndpoint: string
  operatorProof: GoalProofReader
  operatorPolicyHash: string
  reservePhaseAttempt: (attempt: GoalPhaseAttempt) => Promise<void>
}
const runUnlocked = async (options: CohortOptions) => {
  if (!Number.isInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > 1200)
    throw new Error('Invalid phase call budget')
  if (!Number.isFinite(options.maxSeconds) || options.maxSeconds < 1 || options.maxSeconds > 7200)
    throw new Error('Invalid phase deadline')
  if (options.cases.some((sample) => !/^[A-Za-z0-9_-]{1,100}$/.test(sample.id)))
    throw new Error('Unsafe pipeline case ID')
  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  const manifest = {
    moduleSha256: options.module.sha256,
    version: options.module.DETECTION_VERSION,
    operatorPolicyHash: options.operatorPolicyHash,
    profile: GOAL_PIPELINE_PROFILE,
    profileHash: goalHash(GOAL_PIPELINE_PROFILE),
    cases: options.cases
  }
  const manifestPath = join(options.directory, 'manifest.json')
  if (await Bun.file(manifestPath).exists()) {
    const saved: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (goalHash(saved) !== goalHash(manifest)) throw new Error('Pipeline cohort changed')
  } else await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  const budget = { calls: 0, halted: false }
  const rows: {
    id: string
    result: ReturnType<typeof scoreGoalPipeline> | null
    error: string | null
    calls: number
  }[] = []
  const pending: BenchmarkCase[] = []
  for (const sample of options.cases) {
    const resultPath = join(options.directory, `${sample.id}.json`)
    const attemptPath = join(options.directory, `${sample.id}.attempt.json`)
    if (await Bun.file(resultPath).exists()) {
      const raw: unknown = JSON.parse(await readFile(resultPath, 'utf8'))
      const result = GoalPipelineResultSchema.safeParse(raw)
      if (
        !result.success ||
        result.data.inputHash !== goalHash(goalModelPost(sample)) ||
        result.data.version !== options.module.DETECTION_VERSION
      )
        throw new Error('Invalid completed pipeline checkpoint')
      budget.calls += result.data.calls
      rows.push({
        id: sample.id,
        result: scoreGoalPipeline(sample, result.data, options.operatorProof),
        error: null,
        calls: result.data.calls
      })
    } else if (await Bun.file(attemptPath).exists()) {
      const raw: unknown = JSON.parse(await readFile(attemptPath, 'utf8'))
      const attempt =
        typeof raw === 'object' && raw !== null && 'calls' in raw && typeof raw.calls === 'number' ? raw.calls : null
      if (attempt === null || !Number.isInteger(attempt) || attempt < 0)
        throw new Error('Invalid interrupted pipeline checkpoint')
      budget.calls += attempt
      rows.push({ id: sample.id, result: null, error: 'Interrupted attempt; not retried', calls: attempt })
    } else pending.push(sample)
  }
  if (budget.calls > options.maxCalls) throw new Error('Saved calls exceed the phase budget')
  const start = performance.now()
  const execute = async (sample: BenchmarkCase) => {
    const attemptPath = join(options.directory, `${sample.id}.attempt.json`)
    const modelPost = goalModelPost(sample)
    const attempt = { id: sample.id, inputHash: goalHash(modelPost), moduleSha256: options.module.sha256, calls: 0 }
    await writeFile(attemptPath, JSON.stringify(attempt), { mode: 0o600, flag: 'wx' })
    const client = createGoalModelClient({
      ...options,
      beforeCall: async (stage, body) => {
        if (budget.calls >= options.maxCalls || performance.now() - start > options.maxSeconds * 1000)
          throw new Error('Pipeline phase budget or deadline exhausted')
        await options.reservePhaseAttempt({
          stage,
          inputHash: goalHash(body),
          moduleSha256: options.module.sha256,
          caseId: sample.id
        })
        budget.calls += 1
        attempt.calls += 1
        await writeFile(attemptPath, JSON.stringify(attempt), { mode: 0o600 })
        await writeFile(
          join(options.directory, `${sample.id}.call-${attempt.calls}.json`),
          JSON.stringify({ stage, inputHash: goalHash(body), body }, null, 2),
          { mode: 0o600, flag: 'wx' }
        )
      },
      afterCall: async (stage, response) => {
        await writeFile(
          join(options.directory, `${sample.id}.response-${attempt.calls}.json`),
          JSON.stringify({ stage, responseHash: goalHash(response), response }, null, 2),
          { mode: 0o600, flag: 'wx' }
        )
      }
    })
    try {
      const result = await runGoalPipeline({ module: options.module, post: modelPost, ...client })
      if (result.calls !== attempt.calls) throw new Error('Pipeline call accounting mismatch')
      await writeFile(join(options.directory, `${sample.id}.json`), JSON.stringify(result, null, 2) + '\n', {
        mode: 0o600,
        flag: 'wx'
      })
      rows.push({
        id: sample.id,
        result: scoreGoalPipeline(sample, result, options.operatorProof),
        error: null,
        calls: attempt.calls
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown pipeline error'
      if (
        /HTTP \d{3}|Evaluation transport failure|Invalid (?:evaluation JSON|Clef evaluation) response|not configured|network|fetch|timeout|aborted/i.test(
          message
        )
      )
        budget.halted = true
      rows.push({ id: sample.id, result: null, error: message, calls: attempt.calls })
      await writeFile(
        join(options.directory, `${sample.id}.error.json`),
        JSON.stringify({ ...attempt, error: message }),
        { mode: 0o600, flag: 'wx' }
      )
    }
    console.log(
      JSON.stringify({
        completed: rows.length,
        total: options.cases.length,
        calls: budget.calls,
        errors: rows.filter((row) => row.error !== null).length
      })
    )
  }
  const worker = async (): Promise<void> => {
    if (budget.halted) return
    const sample = pending.shift()
    if (sample === undefined) return
    await execute(sample)
    await worker()
  }
  await Promise.all([worker(), worker()])
  const scores = rows.flatMap((row) => (row.result === null ? [] : [row.result]))
  const scoreSummary = summarizeGoalPipelines(scores)
  const summary = {
    ...scoreSummary,
    total: options.cases.length,
    positive: options.cases.filter((sample) => sample.expected.isEvent).length,
    negative: options.cases.filter((sample) => !sample.expected.isEvent).length,
    completed: rows.length,
    errors: rows.filter((row) => row.error !== null).length,
    transportErrors: rows.filter(
      (row) =>
        row.error !== null &&
        /HTTP \d{3}|Evaluation transport failure|Invalid (?:evaluation JSON|Clef evaluation) response|not configured|network|fetch|timeout|aborted/i.test(
          row.error
        )
    ).length,
    validationErrors: rows.filter(
      (row) =>
        row.error !== null &&
        !/HTTP \d{3}|Evaluation transport failure|Invalid (?:evaluation JSON|Clef evaluation) response|not configured|network|fetch|timeout|aborted/i.test(
          row.error
        )
    ).length,
    missing: options.cases.length - rows.length,
    haltedOnTransportError: budget.halted,
    calls: budget.calls,
    elapsedMs: Math.round(performance.now() - start),
    provisionalLabels: true,
    version: options.module.DETECTION_VERSION,
    moduleSha256: options.module.sha256,
    rows
  }
  const finalSummary = {
    ...summary,
    recall: summary.positive === 0 ? null : summary.TP / summary.positive,
    effectiveRecall: summary.positive === 0 ? null : summary.TP / summary.positive,
    hardFN: summary.FN,
    positiveMisses: summary.positive - summary.TP,
    layerMetrics: Object.fromEntries(
      Object.entries(summary.layerMetrics).map(([layer, metrics]) => [
        layer,
        {
          ...metrics,
          positiveMisses: summary.positive - metrics.TP,
          effectiveRecall: summary.positive === 0 ? null : metrics.TP / summary.positive,
          unavailable: metrics.unavailable + options.cases.length - scores.length
        }
      ])
    ),
    falsePositiveRate: summary.negative === 0 ? null : summary.FP / summary.negative,
    positiveErrors: rows.filter(
      (row) => row.error !== null && options.cases.some((sample) => sample.id === row.id && sample.expected.isEvent)
    ).length,
    negativeErrors: rows.filter(
      (row) => row.error !== null && options.cases.some((sample) => sample.id === row.id && !sample.expected.isEvent)
    ).length
  }
  await writeFile(join(options.directory, 'summary.json'), JSON.stringify(finalSummary, null, 2) + '\n', {
    mode: 0o600
  })
  return finalSummary
}

// 同じarmへ複数processが送信しない。作成したlockだけをfinallyで閉じて除去する。
export const runGoalPipelineCohort = async (options: CohortOptions) => {
  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  const lockPath = join(options.directory, '.run.lock')
  const lock = await open(lockPath, 'wx', 0o600)
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, version: options.module.DETECTION_VERSION }))
    return await runUnlocked(options)
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}
