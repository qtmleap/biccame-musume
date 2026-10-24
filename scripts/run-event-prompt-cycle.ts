import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { BenchmarkCaseSchema } from './lib/event-detect/benchmark-schema'
import { callClef } from './lib/event-detect/decide'
import { loadPromptCycleEvaluator, promptCycleHash } from './lib/event-detect/prompt-cycle-evaluator'
import { runPromptCycleArm } from './lib/event-detect/prompt-cycle-run'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    evaluator: { type: 'string' },
    manifest: { type: 'string' },
    arm: { type: 'string' },
    reuse: { type: 'string' },
    live: { type: 'boolean', default: false },
    root: { type: 'string', default: '.wrangler/benchmarks/prompt-cycle' },
    endpoint: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/decide' },
    'max-calls': { type: 'string', default: '800' },
    concurrency: { type: 'string', default: '2' },
    'max-seconds': { type: 'string', default: '1800' }
  },
  strict: true
})
if (values.evaluator === undefined || values.manifest === undefined || values.arm === undefined)
  throw new Error('Cycle requires --evaluator, --manifest and --arm')
if (!['dev-baseline', 'dev-round1', 'dev-round2', 'final-baseline', 'final-candidate'].includes(values.arm))
  throw new Error('Cycle arm is outside the two-round protocol')
const root = resolve(values.root)
const allowed = resolve('.wrangler/benchmarks') + '/'
if (!root.startsWith(allowed)) throw new Error('Cycle reports must stay in the ignored benchmark directory')
const evaluator = await loadPromptCycleEvaluator(resolve(values.evaluator))
if (
  promptCycleHash(evaluator.thresholds) !==
  promptCycleHash({ eventThreshold: 0.9, fieldThreshold: 0.9, ignoreThreshold: 0.5 })
)
  throw new Error('Cycle thresholds differ from the frozen v8 baseline')
const raw: unknown = await Bun.file(values.manifest).json()
const parsed = z.union([z.array(BenchmarkCaseSchema), z.object({ cases: z.array(BenchmarkCaseSchema) })]).safeParse(raw)
if (!parsed.success) throw new Error('Invalid cycle case manifest')
const cases = Array.isArray(parsed.data) ? parsed.data : parsed.data.cases
if (new Set(cases.map((sample) => sample.id)).size !== cases.length) throw new Error('Duplicate cycle case ID')
if (cases.length < 100) throw new Error('Cycle requires at least 100 cases')
const inventory = {
  version: evaluator.version,
  evaluatorHash: evaluator.sha256,
  arm: values.arm,
  cases: cases.length,
  caseHash: promptCycleHash(cases),
  positive: cases.filter((sample) => sample.expected.isEvent).length,
  negative: cases.filter((sample) => !sample.expected.isEvent).length,
  thresholds: evaluator.thresholds
}
if (!values.live && values.reuse === undefined) {
  console.log(JSON.stringify({ mode: 'offline-inventory', ...inventory, newAiCalls: 0 }, null, 2))
} else {
  const endpoint = new URL(values.endpoint)
  if (
    endpoint.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
    endpoint.pathname !== '/api/admin/event-detect/decide' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.search !== '' ||
    endpoint.hash !== ''
  )
    throw new Error('Cycle requires the existing local evaluation endpoint')
  if (values.live && values.reuse !== undefined) throw new Error('Choose live evaluation or saved baseline replay')
  const summary = await runPromptCycleArm({
    root,
    arm: values.arm,
    cases,
    evaluator,
    reuseDirectory: values.reuse === undefined ? null : resolve(values.reuse),
    maxCalls: Number(values['max-calls']),
    concurrency: Number(values.concurrency),
    maxDurationMs: Number(values['max-seconds']) * 1000,
    run: async (request) => {
      if (!values.live) throw new Error('External AI is disabled')
      return await callClef(endpoint.href, request, 0)
    }
  })
  console.log(JSON.stringify({ mode: values.live ? 'live-cycle-arm' : 'saved-baseline-replay', ...summary }, null, 2))
}
