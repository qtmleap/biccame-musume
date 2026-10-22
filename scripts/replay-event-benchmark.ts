import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { buildDetectionDraft, DETECTION_VERSION, evaluateDetection } from '@biccame/shared/event-detect/detection'
import { z } from 'zod'
import { readBenchmarkBaselineSnapshot } from './lib/event-detect/benchmark-baseline'
import { eventBenchmarkCases } from './lib/event-detect/benchmark-cases'
import { benchmarkSignals, scoreBenchmarkDecision } from './lib/event-detect/benchmark-score'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { input: { type: 'string' }, 'baseline-json': { type: 'string' }, out: { type: 'string' } },
  strict: true
})
if (values.input === undefined || values['baseline-json'] === undefined || values.out === undefined)
  throw new Error('Replay requires --input, --baseline-json and --out')
const armSchema = z.object({ requests: z.array(ClefRequestSchema).nonempty(), response: ClefResponseSchema })
const parsed = z
  .object({ case: z.string().nonempty(), before: armSchema, after: armSchema })
  .safeParse(await Bun.file(values.input).json())
if (!parsed.success) throw new Error('Invalid saved benchmark comparison')
const fixture = eventBenchmarkCases.find((sample) => sample.id === parsed.data.case)
if (fixture === undefined) throw new Error('Unknown benchmark case')
const baseline = await readBenchmarkBaselineSnapshot(values['baseline-json'])
if (baseline.post.id !== fixture.post.id) throw new Error('Baseline belongs to another case')
const sample = { ...fixture, post: baseline.post }
const replay = (arm: z.infer<typeof armSchema>) => {
  const request = {
    ...arm.requests[0],
    questions: Object.fromEntries(arm.requests.flatMap((batch) => Object.entries(batch.questions)))
  }
  const decision = evaluateDetection(sample.post, request, arm.response)
  return {
    score: scoreBenchmarkDecision(sample, decision, buildDetectionDraft(sample.post, arm.response.answers)),
    signals: benchmarkSignals(arm.response)
  }
}
const report = {
  mode: 'offline-replay',
  source: resolve(values.input),
  evaluatorVersion: DETECTION_VERSION,
  before: replay(parsed.data.before),
  after: replay(parsed.data.after),
  note: 'No model calls. Candidate fields use the draft when registration is held; status still must match the gold label.'
}
await mkdir(resolve('.wrangler/benchmarks'), { recursive: true, mode: 0o700 })
await writeFile(resolve(values.out), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
console.log(JSON.stringify(report, null, 2))
