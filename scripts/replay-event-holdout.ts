import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { readBenchmarkCohortManifest } from './lib/event-detect/benchmark-cohort-run'
import { type BenchmarkCaseResult, summarizeBenchmarkCohort } from './lib/event-detect/benchmark-metrics'
import { replayBenchmarkResult } from './lib/event-detect/benchmark-replay'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { directory: { type: 'string' }, out: { type: 'string' } },
  strict: true
})
if (values.directory === undefined || values.out === undefined) throw new Error('Replay requires --directory and --out')
const directory = resolve(values.directory)
const manifest = await readBenchmarkCohortManifest(directory)
const schema = z.object({
  id: z.string().nonempty(),
  calls: z.number().int().nonnegative(),
  error: z.union([z.string().nonempty(), z.null()])
})
const results: BenchmarkCaseResult[] = []
for (const sample of manifest.cases) {
  const path = resolve(directory, `${sample.id}.json`)
  if (!(await Bun.file(path).exists())) continue
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
  const parsed = schema.safeParse(raw)
  if (!parsed.success || parsed.data.id !== sample.id) throw new Error('Invalid checkpoint')
  results.push({ ...parsed.data, score: parsed.data.error === null ? replayBenchmarkResult(sample, raw) : null })
}
const report = {
  mode: 'offline-holdout-rescore',
  source: directory,
  version: manifest.version,
  seed: manifest.seed,
  ...summarizeBenchmarkCohort(manifest.cases, results),
  newAiCalls: 0
}
await writeFile(resolve(values.out), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
console.log(JSON.stringify(report, null, 2))
