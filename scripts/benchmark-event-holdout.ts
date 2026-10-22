import { writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_DETECTION_THRESHOLDS, DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { readBenchmarkCohortBaseline } from './lib/event-detect/benchmark-cohort-baseline'
import { readBenchmarkCohortManifest, runBenchmarkCohort } from './lib/event-detect/benchmark-cohort-run'
import { loadBenchmarkCorpus, selectBenchmarkHoldout } from './lib/event-detect/benchmark-corpus'
import { frozenBenchmarkSelection } from './lib/event-detect/benchmark-frozen-selection'
import { callClef } from './lib/event-detect/decide'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    live: { type: 'boolean', default: false },
    'baseline-db': { type: 'string' },
    limit: { type: 'string', default: '100' },
    seed: { type: 'string', default: 'biccame-v8-holdout-20261020' },
    'max-calls': { type: 'string', default: '200' },
    concurrency: { type: 'string', default: '2' },
    'max-seconds': { type: 'string', default: '2700' },
    directory: { type: 'string', default: '.wrangler/benchmarks/holdout-v8-100-r2-strict' },
    endpoint: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/decide' }
  },
  strict: true
})
const limit = Number(values.limit)
if (!Number.isInteger(limit) || limit < 100) throw new Error('The benchmark requires at least 100 holdout cases')
const corpus = await loadBenchmarkCorpus()
const directory = resolve(values.directory)
const allowed = resolve('.wrangler/benchmarks') + sep
if (!directory.startsWith(allowed)) throw new Error('Live reports must stay in the gitignored benchmark directory')
const frozen = (await Bun.file(resolve(directory, 'manifest.json')).exists())
  ? await readBenchmarkCohortManifest(directory)
  : null
const selected =
  frozen === null
    ? selectBenchmarkHoldout(corpus.cases, limit, values.seed)
    : frozenBenchmarkSelection(frozen.cases, frozen.seed, frozen.provenance)
if (selected.cases.length !== limit) throw new Error('Requested limit differs from the frozen manifest')
const provenance =
  frozen === null
    ? {
        source: 'selection' as const,
        revision: 'selection-v2-boundary-excluded',
        corpusUnique: corpus.cases.length,
        availableIndependentHoldout: selected.available,
        excluded: selected.excluded,
        reusedCases: 0,
        newlyEvaluatedCases: selected.cases.length
      }
    : frozen.provenance
const inventory = {
  version: DETECTION_VERSION,
  corpusFiles: corpus.files.length,
  uniqueCorpus: corpus.cases.length,
  duplicatesRemoved: corpus.duplicates,
  availableIndependentHoldout: selected.available,
  selected: selected.cases.length,
  selectionProvenance: provenance === undefined ? 'legacy-unrecorded' : provenance,
  currentCorpusIsSelectionProvenance: frozen === null,
  distribution: selected.distribution,
  excluded: selected.excluded,
  excludedCaseCount: selected.excluded === null ? null : new Set(selected.excluded.map((item) => item.id)).size,
  exclusionReasonCount: selected.excluded === null ? null : selected.excluded.length,
  seed: selected.seed,
  thresholds: DEFAULT_DETECTION_THRESHOLDS,
  annotated: Object.fromEntries(
    ['category', 'stores', 'characterIds', 'startDate', 'conditions'].map((key) => [
      key,
      selected.cases.filter((sample) =>
        Object.entries(sample.expected).some(([name, value]) => name === key && value !== null)
      ).length
    ])
  ),
  annotations: 'provisional-not-human-reviewed',
  note:
    frozen !== null && provenance === undefined
      ? 'Legacy frozen selection provenance was not recorded; current corpus counts do not reconstruct it. Missing annotations are not empty labels.'
      : 'Development and boundary posts and duplicate campaign groups are excluded. Missing annotations are not empty labels.'
}
if (!values.live) {
  console.log(JSON.stringify({ mode: 'offline-corpus-manifest', ...inventory, aiCalls: 0 }, null, 2))
} else {
  const endpoint = new URL(values.endpoint)
  if (endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))
    throw new Error('Only the existing local evaluation endpoint is allowed')
  const maxCalls = Number(values['max-calls'])
  const concurrency = Number(values.concurrency)
  const maxDurationMs = Number(values['max-seconds']) * 1000
  if (!Number.isInteger(maxCalls) || maxCalls > 2000) throw new Error('Invalid explicit call budget')
  console.log(JSON.stringify({ mode: 'live-holdout', ...inventory, maxCalls, concurrency, directory }))
  const summary = await runBenchmarkCohort({
    cases: selected.cases,
    seed: selected.seed,
    directory,
    maxCalls,
    concurrency,
    maxDurationMs,
    ...(provenance === undefined ? {} : { provenance }),
    run: async (request) => await callClef(endpoint.href, request, 0)
  })
  if (values['baseline-db'] !== undefined) {
    const baseline = readBenchmarkCohortBaseline(resolve(values['baseline-db']), selected.cases)
    const path = resolve(directory, 'historical-baseline.json')
    if (!(await Bun.file(path).exists()))
      await writeFile(path, JSON.stringify(baseline, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  }
  console.log(JSON.stringify({ directory, ...summary }, null, 2))
}
