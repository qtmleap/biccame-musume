import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { buildDetectionDraft, createDetectionRequests, DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import dayjs from 'dayjs'
import { readBenchmarkBaseline, readBenchmarkBaselineSnapshot } from './lib/event-detect/benchmark-baseline'
import { eventBenchmarkCases } from './lib/event-detect/benchmark-cases'
import { runBenchmarkComparison } from './lib/event-detect/benchmark-run'
import { benchmarkSignals, scoreBenchmarkDecision } from './lib/event-detect/benchmark-score'
import { callClef } from './lib/event-detect/decide'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    live: { type: 'boolean', default: false },
    case: { type: 'string' },
    'baseline-db': { type: 'string' },
    'baseline-json': { type: 'string' },
    'save-baseline': { type: 'string' },
    endpoint: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/decide' },
    out: { type: 'string' }
  },
  strict: true
})
const cases =
  values.case === undefined ? eventBenchmarkCases : eventBenchmarkCases.filter((sample) => sample.id === values.case)
if (cases.length === 0) throw new Error('Unknown benchmark case')
if (values['baseline-db'] !== undefined && values['baseline-json'] !== undefined)
  throw new Error('Choose one baseline source')
const baseline =
  values['baseline-json'] !== undefined
    ? await readBenchmarkBaselineSnapshot(resolve(values['baseline-json']))
    : values['baseline-db'] === undefined
      ? null
      : readBenchmarkBaseline(resolve(values['baseline-db']), '2112392477038780586')
if (values['save-baseline'] !== undefined) {
  if (baseline === null || values.live) throw new Error('Freeze a loaded baseline before live execution')
  await mkdir(resolve('.wrangler/benchmarks'), { recursive: true, mode: 0o700 })
  await writeFile(resolve(values['save-baseline']), `${JSON.stringify(baseline, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx'
  })
}

if (!values.live) {
  console.log(
    JSON.stringify(
      {
        mode: 'offline-manifest',
        version: DETECTION_VERSION,
        cases: cases.map((sample) => ({
          id: sample.id,
          source: sample.source,
          expected: sample.expected,
          batches: createDetectionRequests(sample.post).map((request) => Object.keys(request.questions).length)
        })),
        storedBaseline:
          baseline === null
            ? null
            : {
                version: baseline.snapshot.questionVersion,
                score: scoreBenchmarkDecision(
                  eventBenchmarkCases[0],
                  baseline.decision,
                  buildDetectionDraft(baseline.post, baseline.response.answers)
                ),
                signals: benchmarkSignals(baseline.response)
              },
        note: 'No AI calls. Expected labels are not model predictions.'
      },
      null,
      2
    )
  )
} else {
  if (cases.length !== 1 || cases[0].id !== 'yuurakuchou-limited-gift-card' || baseline === null)
    throw new Error('Live comparison requires the public-post case and a saved baseline; no batch-wide live execution')
  const endpoint = new URL(values.endpoint)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.protocol !== 'http:')
    throw new Error('Live benchmark requires the existing local evaluation endpoint')
  const fixture = cases[0]
  if (baseline.post.id !== fixture.post.id) throw new Error('Frozen baseline belongs to a different benchmark case')
  const sample = { ...fixture, post: baseline.post }
  const result = await runBenchmarkComparison(
    sample,
    baseline.snapshot.requests,
    createDetectionRequests(sample.post, baseline.snapshot.requests[0].model),
    async (request) => await callClef(endpoint.href, request, 0)
  )
  const report = {
    mode: 'live-comparison',
    case: sample.id,
    at: dayjs().toISOString(),
    versions: { before: baseline.snapshot.questionVersion, after: DETECTION_VERSION },
    storedBaseline: {
      score: scoreBenchmarkDecision(
        sample,
        baseline.decision,
        buildDetectionDraft(baseline.post, baseline.response.answers)
      ),
      signals: benchmarkSignals(baseline.response)
    },
    ...result,
    limitations: [
      'Only one public post was evaluated live once per arm; this is not a population accuracy estimate.',
      'Both live arms use the current decision rules; storedBaseline retains the historical saved decision.',
      'No production database, event, notification or saved webhook decision was changed.',
      'The date and input text are frozen; model inference may vary between runs.'
    ]
  }
  const directory = resolve('.wrangler/benchmarks')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const output =
    values.out === undefined
      ? resolve(directory, `event-detection-${dayjs().format('YYYYMMDDTHHmmssSSS')}.json`)
      : resolve(values.out)
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  console.log(
    JSON.stringify(
      {
        output,
        versions: report.versions,
        calls: result.calls,
        storedStatus: baseline.decision.status,
        before: result.before.score,
        after: result.after.score
      },
      null,
      2
    )
  )
}
