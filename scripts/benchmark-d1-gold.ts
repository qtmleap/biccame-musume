import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { D1_GOLD_CALL_LIMIT } from './lib/event-detect/d1-gold-ledger'
import { buildCaseRecord } from './lib/event-detect/d1-gold-records'
import { checkReplayParity, checkSourceParity } from './lib/event-detect/d1-gold-replay'
import { formatScore } from './lib/event-detect/d1-gold-report'
import { readCaseStates, runGoldCohort } from './lib/event-detect/d1-gold-run'
import { GoldBundleSchema, goldBundleOf, loadGoldCases, sha256Hex } from './lib/event-detect/d1-gold-schema'
import { type PostError, scoreRecords } from './lib/event-detect/d1-gold-score'
import { D1_GOLD_DEFAULT_SEED, D1_GOLD_DEFAULT_SIZE, selectGoldCohort } from './lib/event-detect/d1-gold-select'
import { loadGoalPipelineModule } from './lib/event-detect/goal-pipeline-module'
import { GOAL_PIPELINE_PROFILE } from './lib/event-detect/goal-pipeline-profile'

const ROOT = '.wrangler/benchmarks/d1-gold'
const MODULE = '.wrangler/benchmarks/goal-pipeline/candidate-v15-choice.mjs'
const EXPECTED_BUNDLE_PREFIX = '9666888244e7'
// 前回の測定（陽性49投稿）の実績: 1投稿あたり平均3.35回、最大6回。
const PRIOR_MEAN_CALLS = 3.35

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    live: { type: 'boolean', default: false },
    score: { type: 'string' },
    cases: { type: 'string', default: `${ROOT}/cases.json` },
    directory: { type: 'string', default: `${ROOT}/run-v15-100` },
    module: { type: 'string', default: MODULE },
    seed: { type: 'string', default: D1_GOLD_DEFAULT_SEED },
    size: { type: 'string', default: String(D1_GOLD_DEFAULT_SIZE) },
    'max-calls': { type: 'string', default: String(D1_GOLD_CALL_LIMIT) },
    'max-seconds': { type: 'string', default: '7200' },
    decide: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/decide' },
    extract: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/extract-evaluate' }
  },
  strict: true
})

// 出力先はこの測定専用の無視ディレクトリの配下に限る。既存のベンチマーク出力には書かない。
const assertOwnDirectory = (path: string) => {
  const directory = resolve(path)
  if (!directory.startsWith(resolve(ROOT) + sep)) throw new Error('Output must stay under the d1-gold directory')
  return directory
}
const writeJson = async (path: string, value: unknown, flag: 'w' | 'wx' = 'w') =>
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag })

const loaded = await loadGoldCases(resolve(values.cases))
const size = Number(values.size)
const selected = selectGoldCohort(loaded.cases, size, values.seed)
const estimate = {
  perPostMeanFromPriorRun: PRIOR_MEAN_CALLS,
  expected: Math.round(selected.cases.length * PRIOR_MEAN_CALLS),
  // 件数質問1 + 抽出1 + 候補ごとの判定。件数の不一致で抽出をやり直す最大1回を足した上限の見積もり。
  structuralMinimum: selected.cases.reduce((sum, sample) => sum + 2 + sample.events.length, 0),
  structuralMaximum: selected.cases.reduce((sum, sample) => sum + 3 + sample.events.length + 1, 0)
}

const readSelection = async (directory: string) => {
  const parsed = z
    .object({
      inputSha256: z.string().nonempty(),
      selection: z.object({
        caseIds: z.array(z.string().nonempty()).nonempty(),
        forcedCaseIds: z.array(z.string().nonempty()),
        caseIdsSha256: z.string().nonempty()
      })
    })
    .safeParse(JSON.parse(await readFile(resolve(directory, 'selection.json'), 'utf8')))
  if (!parsed.success) throw new Error('Invalid selection.json')
  if (parsed.data.inputSha256 !== loaded.sha256) throw new Error('cases.json changed since the selection was saved')
  const byId = new Map(loaded.cases.map((sample) => [sample.caseId, sample]))
  const cases = parsed.data.selection.caseIds.map((id) => {
    const sample = byId.get(id)
    if (sample === undefined) throw new Error('Selected case is missing from cases.json')
    return sample
  })
  return {
    cases,
    caseIdsSha256: parsed.data.selection.caseIdsSha256,
    forcedCaseIds: new Set(parsed.data.selection.forcedCaseIds)
  }
}

const README = [
  '# D1 gold measurement: pipeline v5-webhook-v15-concise-author',
  '',
  'This run was started on the user\'s explicit instruction ("実AIを呼ばなきゃ正解するかどうかわからない").',
  'It is a user-directed measurement, not an independent review, and one run only (100 posts, positives only).',
  '',
  '- Ground truth: human-corrected D1 events (cases.json). Model input is the public post fields only; gold stays in gold.json.',
  '- Selection: every post whose D1 events have an explicit character is included (forced stratum, to make the character comparison measurable);',
  '  the remaining slots are allocated proportionally over post year (JST) x primary category, min 1 per stratum, in fixed-seed hash order.',
  '  Scores are reported for the whole cohort and for the regular subset without the forced stratum.',
  `- Call ledger: ${ROOT}/run-v15-100/live-attempts.jsonl (appended before each send), limit ${D1_GOLD_CALL_LIMIT}, concurrency <= 2, no automatic retry.`,
  '- Separate from the phase guards: phase-live-attempts.jsonl, goal-live-smoke-result.json, .phase-run.lock,',
  '  the 1200 phase budget and the existing approval files are neither read, written nor extended by this run.',
  '- Endpoints: local evaluation API only (decide / extract-evaluate). No D1, notification or production writes.'
].join('\n')

if (values.score !== undefined) {
  const directory = assertOwnDirectory(values.score)
  const module = await loadGoalPipelineModule(resolve(values.module))
  const selection = await readSelection(directory)
  const states = await readCaseStates(directory, selection.cases, module)
  const records = selection.cases.map((sample) => {
    const state = states.get(sample.caseId)
    if (state === undefined) throw new Error('Missing case state')
    return buildCaseRecord(module, sample, state.result)
  })
  const errors: PostError[] = selection.cases.flatMap((sample) => {
    const state = states.get(sample.caseId)
    return state === undefined || state.errors.length === 0
      ? []
      : [
          {
            caseId: sample.caseId,
            kinds: state.errors.map((error) => error.kind),
            messages: state.errors.map((error) => error.message),
            calls: state.errors.reduce((sum, error) => sum + error.calls, 0)
          }
        ]
  })
  const judgements = [...states.values()].flatMap((state) => (state.result === null ? [] : state.result.judgements))
  const parity = checkReplayParity(module, judgements)
  const source = await checkSourceParity(resolve(values.module.replace(/\.mjs$/, '.meta.json')), process.cwd())
  // 凍結版と作業ツリーの detection.ts が食い違う、または未改変の再評価が保存した判定と食い違うなら (d) は解釈できない。
  const topOneInterpretable = parity.ok && source.detectionTsSame
  const score = scoreRecords(selection.cases, records, errors)
  // 明示された娘の専用枠を除いた、層化抽出だけの部分集合でも同じ集計を出す（専用枠は娘の測定のために過剰に含めている）。
  const isRegular = (caseId: string) => !selection.forcedCaseIds.has(caseId)
  const regularScore = scoreRecords(
    selection.cases.filter((sample) => isRegular(sample.caseId)),
    records.filter((record) => isRegular(record.caseId)),
    errors.filter((error) => isRegular(error.caseId))
  )
  const output = {
    ...score,
    regularSubset: regularScore,
    integrity: { replayParity: parity, sourceParity: source, topOneInterpretable }
  }
  await writeJson(resolve(directory, 'score.json'), output)
  await writeJson(resolve(directory, 'records.json'), records)
  console.log(formatScore(score, topOneInterpretable))
  console.log(
    `\n\n=== Regular subset: stratified posts only, without the ${selection.forcedCaseIds.size} forced explicit-character posts ===\n`
  )
  console.log(formatScore(regularScore, topOneInterpretable))
  console.log(
    `\nintegrity: replay parity ${parity.checked - parity.mismatched}/${parity.checked}; frozen source files changed in tree: ${source.changed.length} of ${source.checked}${source.changed.length === 0 ? '' : ` (${source.changed.join(', ')})`}`
  )
} else if (!values.live) {
  console.log(
    JSON.stringify(
      {
        mode: 'offline-d1-gold-inventory',
        inputSha256: loaded.sha256,
        casesInFile: loaded.cases.length,
        eventsInFile: loaded.cases.reduce((sum, sample) => sum + sample.events.length, 0),
        sidelinedExcluded: loaded.sidelined,
        seed: selected.selection.seed,
        selected: selected.cases.length,
        selectedEvents: selected.selection.events,
        strata: selected.selection.strata,
        caseIdsSha256: selected.selection.caseIdsSha256,
        firstCaseIds: selected.selection.caseIds.slice(0, 5),
        multiEventPosts: selected.cases.filter((sample) => sample.events.length > 1).length,
        forcedExplicitCharacterPosts: selected.selection.forced.selected,
        explicitCharacterEvents: selected.cases.reduce(
          (sum, sample) => sum + sample.events.filter((event) => event.characterIds.length > 0).length,
          0
        ),
        callEstimate: estimate,
        callLimit: D1_GOLD_CALL_LIMIT,
        withinLimit: estimate.expected <= D1_GOLD_CALL_LIMIT,
        calls: 0
      },
      null,
      2
    )
  )
} else {
  const directory = assertOwnDirectory(values.directory)
  const maxCalls = Number(values['max-calls'])
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > D1_GOLD_CALL_LIMIT)
    throw new Error('Invalid call limit')
  const module = await loadGoalPipelineModule(resolve(values.module))
  if (!module.sha256.startsWith(EXPECTED_BUNDLE_PREFIX)) throw new Error('Unexpected frozen pipeline bundle')
  const profileSha = sha256Hex(await readFile('.wrangler/production-sync/goal-runtime-profile.json'))
  if (profileSha !== GOAL_PIPELINE_PROFILE.snapshotFileSha256) throw new Error('Runtime profile snapshot hash mismatch')
  const origin = new URL(values.decide).origin
  const health = await fetch(`${origin}/api/events`)
  if (health.status !== 200) throw new Error(`Dev server health check failed: HTTP ${health.status}`)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const selectionPath = resolve(directory, 'selection.json')
  if (await Bun.file(selectionPath).exists()) {
    const saved = await readSelection(directory)
    if (saved.caseIdsSha256 !== selected.selection.caseIdsSha256)
      throw new Error('Saved selection differs from the seed')
  } else {
    await writeJson(selectionPath, { inputSha256: loaded.sha256, selection: selected.selection }, 'wx')
    await writeJson(resolve(directory, 'gold.json'), goldBundleOf(selected.cases, loaded.sha256), 'wx')
    await writeFile(resolve(directory, 'README.md'), `${README}\n`, { mode: 0o600, flag: 'wx' })
  }
  if (!GoldBundleSchema.safeParse(JSON.parse(await readFile(resolve(directory, 'gold.json'), 'utf8'))).success)
    throw new Error('Invalid gold.json')
  const summary = await runGoldCohort({
    module,
    cases: selected.cases,
    directory,
    maxCalls,
    maxSeconds: Number(values['max-seconds']),
    decideEndpoint: values.decide,
    extractionEndpoint: values.extract
  })
  console.log(JSON.stringify(summary, null, 2))
}
