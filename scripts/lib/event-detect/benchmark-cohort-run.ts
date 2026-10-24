import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createDetectionRequests, DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { z } from 'zod'
import { benchmarkRequestHash } from './benchmark-checkpoint'
import { type BenchmarkCaseResult, summarizeBenchmarkCohort } from './benchmark-metrics'
import { type BenchmarkProvenance, BenchmarkProvenanceSchema } from './benchmark-provenance'
import { type BenchmarkRunner, runBenchmarkArm } from './benchmark-run'
import { type BenchmarkCase, BenchmarkCaseSchema } from './benchmark-schema'

const manifestSchema = z.object({
  version: z.string().nonempty(),
  seed: z.string().nonempty(),
  cases: z.array(BenchmarkCaseSchema).min(100),
  provisionalLabels: z.literal(true),
  provenance: BenchmarkProvenanceSchema.optional()
})
export const readBenchmarkCohortManifest = async (directory: string) => {
  const parsed = manifestSchema.safeParse(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')))
  if (!parsed.success || parsed.data.version !== DETECTION_VERSION)
    throw new Error('Invalid frozen manifest or evaluator version')
  return parsed.data
}
const resultSchema = z.object({
  id: z.string().nonempty(),
  calls: z.number().int().nonnegative(),
  score: z.unknown(),
  error: z.union([z.string().nonempty(), z.null()])
})
const exists = async (path: string) => await Bun.file(path).exists()
const checksum = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export const runBenchmarkCohort = async (input: {
  cases: BenchmarkCase[]
  seed: string
  directory: string
  run: BenchmarkRunner
  maxCalls: number
  concurrency: number
  maxDurationMs: number
  provenance?: BenchmarkProvenance
}) => {
  if (!Number.isInteger(input.concurrency) || input.concurrency < 1 || input.concurrency > 2)
    throw new Error('Concurrency must be 1 or 2')
  if (input.cases.length < 100) throw new Error('At least 100 holdout cases are required')
  if (input.cases.some((sample) => !BenchmarkCaseSchema.safeParse(sample).success))
    throw new Error('Invalid case input or unsafe case id')
  if (!Number.isInteger(input.maxCalls) || input.maxCalls < input.cases.length * 2)
    throw new Error('Call budget is smaller than the complete cohort')
  if (!Number.isFinite(input.maxDurationMs) || input.maxDurationMs < 1 || input.maxDurationMs > 3_600_000)
    throw new Error('Duration must be bounded to one hour')
  await mkdir(input.directory, { recursive: true, mode: 0o700 })
  const manifestPath = join(input.directory, 'manifest.json')
  const manifest = {
    version: DETECTION_VERSION,
    seed: input.seed,
    cases: input.cases,
    provisionalLabels: true,
    ...(input.provenance === undefined ? {} : { provenance: input.provenance })
  }
  if (await exists(manifestPath)) {
    const saved = manifestSchema.safeParse(JSON.parse(await readFile(manifestPath, 'utf8')))
    if (!saved.success || checksum(saved.data) !== checksum(manifest))
      throw new Error('Resume manifest does not match the frozen cohort/version')
  } else {
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  }
  const results: BenchmarkCaseResult[] = []
  const budget = { calls: 0 }
  const pending: BenchmarkCase[] = []
  for (const sample of input.cases) {
    const resultPath = join(input.directory, `${sample.id}.json`)
    const attemptPath = join(input.directory, `${sample.id}.attempt.json`)
    if (await exists(resultPath)) {
      const raw: unknown = JSON.parse(await readFile(resultPath, 'utf8'))
      const saved = resultSchema.safeParse(raw)
      if (!saved.success || saved.data.id !== sample.id) throw new Error('Invalid completed checkpoint')
      // 採点は保存応答から再計算し、古いコードで採点した数値を信用しない。
      const payload = z.object({ requests: z.unknown(), response: z.unknown() }).safeParse(raw)
      if (payload.success && saved.data.error === null) {
        const replay = await import('./benchmark-replay')
        results.push({
          id: sample.id,
          calls: saved.data.calls,
          score: replay.replayBenchmarkResult(sample, raw),
          error: null
        })
      } else {
        results.push({
          id: sample.id,
          calls: saved.data.calls,
          score: null,
          error: saved.data.error === null ? 'Missing saved response' : saved.data.error
        })
      }
      budget.calls += saved.data.calls
    } else if (await exists(attemptPath)) {
      const attempted = z
        .object({ calls: z.number().int().nonnegative() })
        .safeParse(JSON.parse(await readFile(attemptPath, 'utf8')))
      if (!attempted.success) throw new Error('Invalid interrupted checkpoint')
      budget.calls += attempted.data.calls
      results.push({
        id: sample.id,
        calls: attempted.data.calls,
        score: null,
        error: 'Interrupted attempt; not retried'
      })
    } else {
      pending.push(sample)
    }
  }
  if (budget.calls > input.maxCalls) throw new Error('Saved attempts already exceed the requested call budget')
  const start = performance.now()
  const execute = async (sample: BenchmarkCase) => {
    const attemptPath = join(input.directory, `${sample.id}.attempt.json`)
    const resultPath = join(input.directory, `${sample.id}.json`)
    const attempt = { id: sample.id, calls: 0 }
    await writeFile(attemptPath, JSON.stringify(attempt), { mode: 0o600, flag: 'wx' })
    try {
      const requests = createDetectionRequests(sample.post)
      const result = await runBenchmarkArm(sample, requests, async (request) => {
        if (budget.calls >= input.maxCalls) throw new Error('Global AI call budget exhausted')
        if (performance.now() - start >= input.maxDurationMs) throw new Error('Global benchmark deadline exceeded')
        budget.calls += 1
        attempt.calls += 1
        await writeFile(attemptPath, JSON.stringify(attempt), { mode: 0o600 })
        return await input.run(request)
      })
      await writeFile(
        resultPath,
        JSON.stringify(
          {
            id: sample.id,
            calls: attempt.calls,
            error: null,
            ...result,
            requestHash: benchmarkRequestHash(result.requests),
            model: requests[0].model
          },
          null,
          2
        ) + '\n',
        { mode: 0o600, flag: 'wx' }
      )
      results.push({ id: sample.id, calls: attempt.calls, score: result.score, error: null })
    } catch (error) {
      const result: BenchmarkCaseResult = {
        id: sample.id,
        calls: attempt.calls,
        score: null,
        error: error instanceof Error ? error.message : 'Unknown benchmark error'
      }
      await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
      results.push(result)
    }
    const summary = summarizeBenchmarkCohort(input.cases, results)
    console.log(
      JSON.stringify({
        progress: results.length,
        total: input.cases.length,
        calls: budget.calls,
        errors: summary.errors
      })
    )
  }
  // 共有キューを取り出す瞬間は同期処理なので同じケースを複数workerが取得しない。
  const worker = async (): Promise<void> => {
    const next = pending.shift()
    if (next === undefined) return
    await execute(next)
    await worker()
  }
  await Promise.all(Array.from({ length: input.concurrency }, () => worker()))
  const summary = {
    version: DETECTION_VERSION,
    seed: input.seed,
    provenance: input.provenance === undefined ? null : input.provenance,
    ...summarizeBenchmarkCohort(input.cases, results),
    elapsedMs: Math.round(performance.now() - start)
  }
  await writeFile(join(input.directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 })
  return summary
}
