import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { z } from 'zod'
import { type BenchmarkCaseResult, summarizeBenchmarkCohort } from './benchmark-metrics'
import type { BenchmarkRunner } from './benchmark-run'
import type { BenchmarkCase } from './benchmark-schema'
import { scoreBenchmarkDecision } from './benchmark-score'
import { type PromptCycleEvaluator, promptCycleHash } from './prompt-cycle-evaluator'

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, 'utf8'))
const savedResponseSchema = z.object({
  id: z.string().nonempty(),
  requestHash: z.string().nonempty(),
  calls: z.number().int().nonnegative(),
  response: z.union([ClefResponseSchema, z.null()]),
  error: z.union([z.string().nonempty(), z.null()])
})

export const runPromptCycleArm = async (input: {
  root: string
  arm: string
  cases: BenchmarkCase[]
  evaluator: PromptCycleEvaluator
  run: BenchmarkRunner
  reuseDirectory: string | null
  maxCalls: number
  concurrency: number
  maxDurationMs: number
}) => {
  if (!/^[a-z0-9-]+$/.test(input.arm)) throw new Error('Unsafe cycle arm name')
  if (input.cases.length < 100) throw new Error('Cycle requires at least 100 cases')
  if (!Number.isInteger(input.maxCalls) || input.maxCalls < 1 || input.maxCalls > 800)
    throw new Error('Invalid cycle budget')
  if (![1, 2].includes(input.concurrency)) throw new Error('Invalid cycle concurrency')
  if (!Number.isFinite(input.maxDurationMs) || input.maxDurationMs < 1 || input.maxDurationMs > 3_600_000)
    throw new Error('Invalid cycle deadline')
  const directory = join(input.root, input.arm)
  const callDirectory = join(input.root, 'calls')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await mkdir(callDirectory, { recursive: true, mode: 0o700 })
  const lock = join(input.root, 'active.lock')
  await writeFile(lock, input.arm, { flag: 'wx', mode: 0o600 })
  try {
    const manifest = {
      arm: input.arm,
      evaluator: {
        version: input.evaluator.version,
        sha256: input.evaluator.sha256,
        thresholds: input.evaluator.thresholds
      },
      model: 'clef',
      cases: input.cases,
      reuseDirectory: input.reuseDirectory
    }
    const manifestPath = join(directory, 'manifest.json')
    if (await Bun.file(manifestPath).exists()) {
      if (promptCycleHash(await readJson(manifestPath)) !== promptCycleHash(manifest))
        throw new Error('Cycle manifest changed; use a different arm')
    } else await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    const callFiles = (await readdir(callDirectory)).filter((file) => /^\d+\.json$/.test(file))
    const callRecords = await Promise.all(
      callFiles.map(async (file) => {
        const parsed = z.object({ arm: z.string().nonempty() }).safeParse(await readJson(join(callDirectory, file)))
        if (!parsed.success) throw new Error('Invalid cycle call ledger')
        return parsed.data
      })
    )
    const budget = {
      calls: callFiles.length,
      armCalls: callRecords.filter((record) => record.arm === input.arm).length
    }
    if (budget.calls > input.maxCalls || budget.armCalls > 200) throw new Error('Existing cycle calls exceed budget')
    const results: BenchmarkCaseResult[] = []
    const pending = [...input.cases]
    const start = performance.now()
    const score = (
      sample: BenchmarkCase,
      requests: ReturnType<PromptCycleEvaluator['requests']>,
      response: z.infer<typeof ClefResponseSchema>
    ) => {
      const evaluated = input.evaluator.evaluate(sample.post, requests, response)
      return scoreBenchmarkDecision(sample, evaluated.decision, evaluated.draft, response)
    }
    const execute = async (sample: BenchmarkCase) => {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(sample.id)) throw new Error('Unsafe case ID')
      const requests = input.evaluator.requests(sample.post)
      const requestHash = promptCycleHash(requests)
      const resultPath = join(directory, `${sample.id}.json`)
      const attemptPath = join(directory, `${sample.id}.attempt.json`)
      if (await Bun.file(resultPath).exists()) {
        const raw = await readJson(resultPath)
        const saved = savedResponseSchema.safeParse(raw)
        if (!saved.success || saved.data.id !== sample.id || saved.data.requestHash !== requestHash)
          throw new Error('Invalid cycle checkpoint')
        if (saved.data.error === null) {
          const success = z
            .object({
              evaluatorHash: z.string().nonempty(),
              version: z.string().nonempty(),
              requests: z.array(ClefRequestSchema).nonempty()
            })
            .safeParse(raw)
          if (
            !success.success ||
            success.data.evaluatorHash !== input.evaluator.sha256 ||
            success.data.version !== input.evaluator.version ||
            promptCycleHash(success.data.requests) !== requestHash
          )
            throw new Error('Saved cycle request or model differs from the frozen evaluator')
        }
        results.push({
          id: sample.id,
          calls: saved.data.calls,
          error: saved.data.error,
          score: saved.data.response === null ? null : score(sample, requests, saved.data.response)
        })
        return
      }
      if (await Bun.file(attemptPath).exists()) {
        const interrupted = z
          .object({
            id: z.string().nonempty(),
            calls: z.number().int().nonnegative(),
            requestHash: z.string().nonempty()
          })
          .safeParse(await readJson(attemptPath))
        if (!interrupted.success || interrupted.data.id !== sample.id || interrupted.data.requestHash !== requestHash)
          throw new Error('Invalid interrupted checkpoint')
        results.push({
          id: sample.id,
          calls: interrupted.data.calls,
          error: 'Interrupted attempt; not retried',
          score: null
        })
        return
      }
      const attempt = { id: sample.id, calls: 0, requestHash }
      await writeFile(attemptPath, JSON.stringify(attempt), { flag: 'wx', mode: 0o600 })
      try {
        const responses: z.infer<typeof ClefResponseSchema>[] = []
        if (input.reuseDirectory !== null) {
          const raw = await readJson(join(input.reuseDirectory, `${sample.id}.json`))
          const old = z
            .object({ id: z.string().nonempty(), requests: z.unknown(), response: ClefResponseSchema })
            .safeParse(raw)
          if (!old.success || old.data.id !== sample.id || promptCycleHash(old.data.requests) !== requestHash)
            throw new Error('Frozen baseline request does not match saved response')
          responses.push(old.data.response)
        } else {
          for (const [index, request] of requests.entries()) {
            if (budget.calls >= input.maxCalls || budget.armCalls >= 200) throw new Error('Cycle call budget exhausted')
            if (performance.now() - start > input.maxDurationMs) throw new Error('Cycle deadline exceeded')
            budget.calls += 1
            budget.armCalls += 1
            attempt.calls += 1
            await writeFile(
              join(callDirectory, `${String(budget.calls).padStart(4, '0')}.json`),
              JSON.stringify({
                arm: input.arm,
                id: sample.id,
                batch: index,
                requestHash,
                evaluatorHash: input.evaluator.sha256
              }),
              { flag: 'wx', mode: 0o600 }
            )
            await writeFile(attemptPath, JSON.stringify(attempt), { mode: 0o600 })
            const parsed = ClefResponseSchema.safeParse(await input.run(request))
            if (
              !parsed.success ||
              Object.entries(request.questions).some(
                ([key, question]) => parsed.data.answers[key]?.type !== question.type
              ) ||
              Object.keys(parsed.data.answers).some((key) => request.questions[key] === undefined)
            )
              throw new Error('Incomplete cycle AI response')
            responses.push(parsed.data)
          }
        }
        const response = { answers: Object.fromEntries(responses.flatMap((item) => Object.entries(item.answers))) }
        const result = {
          id: sample.id,
          calls: attempt.calls,
          requestHash,
          requests,
          response,
          error: null,
          evaluatorHash: input.evaluator.sha256,
          version: input.evaluator.version,
          score: score(sample, requests, response)
        }
        await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
        results.push({ id: sample.id, calls: attempt.calls, error: null, score: result.score })
      } catch (error) {
        const failure = {
          ...attempt,
          response: null,
          error: error instanceof Error ? error.message : 'Unknown cycle failure'
        }
        await writeFile(resultPath, JSON.stringify(failure, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
        results.push({ id: sample.id, calls: attempt.calls, error: failure.error, score: null })
      }
      console.log(
        JSON.stringify({
          arm: input.arm,
          completed: results.length,
          total: input.cases.length,
          globalCalls: budget.calls
        })
      )
    }
    const stopped = { failed: false }
    const worker = async (): Promise<void> => {
      if (stopped.failed) return
      const next = pending.shift()
      if (next === undefined) return
      try {
        await execute(next)
      } catch (error) {
        stopped.failed = true
        throw error
      }
      await worker()
    }
    const workers = await Promise.allSettled(Array.from({ length: input.concurrency }, () => worker()))
    const failed = workers.find((worker) => worker.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    const summary = {
      arm: input.arm,
      evaluator: manifest.evaluator,
      elapsedMs: Math.round(performance.now() - start),
      globalCalls: budget.calls,
      ...summarizeBenchmarkCohort(input.cases, results)
    }
    await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 })
    return summary
  } finally {
    await unlink(lock)
  }
}
