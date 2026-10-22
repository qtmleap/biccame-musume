import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { D1_GOLD_CALL_LIMIT, D1_GOLD_SPLIT_CALL_LIMIT } from './lib/event-detect/d1-gold-ledger'
import { buildCaseRecord } from './lib/event-detect/d1-gold-records'
import { checkReplayParity, checkSourceParity } from './lib/event-detect/d1-gold-replay'
import { formatScore } from './lib/event-detect/d1-gold-report'
import { readCaseStates, runGoldCohort } from './lib/event-detect/d1-gold-run'
import { GoldBundleSchema, goldBundleOf, loadGoldCases, sha256Hex } from './lib/event-detect/d1-gold-schema'
import { type PostError, scoreRecords } from './lib/event-detect/d1-gold-score'
import { D1_GOLD_DEFAULT_SEED, D1_GOLD_DEFAULT_SIZE, selectGoldCohort } from './lib/event-detect/d1-gold-select'
import {
  buildSplit,
  EXTRA_BUCKETS,
  EXTRA_START_POST,
  loadExtraStartPlan,
  loadSidelinedCases,
  loadSplit,
  parseSplitNames,
  prepareExtraStartDirectory,
  resolveSplitCases
} from './lib/event-detect/d1-gold-split'
import { loadGoalPipelineModule } from './lib/event-detect/goal-pipeline-module'
import { GOAL_PIPELINE_PROFILE } from './lib/event-detect/goal-pipeline-profile'

const ROOT = '.wrangler/benchmarks/d1-gold'
const MODULE = '.wrangler/benchmarks/goal-pipeline/candidate-v15-choice.mjs'
// 開発用（前回の測定済みの100投稿）。分割の作成と採点でだけ読む。AI は呼ばない。
const DEV_DIRECTORY = `${ROOT}/run-v15-100`
const EXPECTED_BUNDLE_PREFIX = '9666888244e7'
// 前回の測定（陽性49投稿）の実績: 1投稿あたり平均3.35回、最大6回。
const PRIOR_MEAN_CALLS = 3.35

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    live: { type: 'boolean', default: false },
    score: { type: 'string' },
    // 分割した測定。--split dev,test,extra-post-after-start のうち指定した名前の投稿だけを対象にする。
    split: { type: 'string' },
    'split-file': { type: 'string', default: `${ROOT}/split.json` },
    // --split extra-start-post が読む追加の入力（cases.json と同じ形式）。
    'extra-start-cases': { type: 'string', default: `${ROOT}/cases-extra-start-post.json` },
    'make-split': { type: 'boolean', default: false },
    // 分割ごとの採点の出力先（ROOT の配下。測定の出力先とは別）。
    out: { type: 'string' },
    cases: { type: 'string', default: `${ROOT}/cases.json` },
    directory: { type: 'string', default: `${ROOT}/run-v15-100` },
    module: { type: 'string', default: MODULE },
    seed: { type: 'string', default: D1_GOLD_DEFAULT_SEED },
    size: { type: 'string', default: String(D1_GOLD_DEFAULT_SIZE) },
    'max-calls': { type: 'string' },
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

// 分割した測定の計画。--split を指定したときだけ作る（指定が無ければ従来の層化抽出の100投稿）。
// extra-start-post は分割ファイルの名前ではない（採点側が分割の名前を巡回するため）。別に扱う。
const extraStart = values.split === EXTRA_START_POST
if (extraStart && (values.score !== undefined || values['make-split']))
  throw new Error(`--split ${EXTRA_START_POST} supports only the offline inventory and --live`)
const splitNames = values.split === undefined || extraStart ? null : parseSplitNames(values.split)
const loadSplitPlan = async (names: NonNullable<typeof splitNames>) => {
  const split = await loadSplit(resolve(values['split-file']), loaded.sha256)
  const extra = await loadSidelinedCases(resolve(values.cases), EXTRA_BUCKETS['extra-post-after-start'])
  const cases = resolveSplitCases(split, names, [...loaded.cases, ...extra])
  const caseIds = cases.map((sample) => sample.caseId)
  return { split, names, cases, caseIds, caseIdsSha256: sha256Hex(JSON.stringify(caseIds)) }
}
const loadPlan = async () => {
  if (!extraStart) return splitNames === null ? null : await loadSplitPlan(splitNames)
  const splitPath = resolve(values['split-file'])
  return await loadExtraStartPlan({
    splitPath,
    casesSha256: loaded.sha256,
    extraPath: resolve(values['extra-start-cases'])
  })
}

const SPLIT_README = [
  '# D1 gold measurement on the held-out split: pipeline v5-webhook-v15-concise-author',
  '',
  "Started on the user's explicit instruction (add held-out Golden posts and measure the current baseline with the real AI).",
  'It is a user-directed measurement, one run only. Dev posts (the earlier 100) are NOT re-sent; this run holds the test split',
  'and the extra-post-after-start side group, kept apart from the main metric.',
  '',
  '- Ground truth: human-corrected D1 events (cases.json). Model input is the public post fields only; gold stays in gold.json.',
  `- Call ledger: live-attempts.jsonl in this directory (appended before each send), limit ${D1_GOLD_SPLIT_CALL_LIMIT}, concurrency <= 2, no automatic retry.`,
  '- Separate from the phase guards and from the run-v15-100 / confirm-v15 ledgers: none of them is read or written.',
  '- Endpoints: local evaluation API only (decide / extract-evaluate). No D1, notification or production writes.'
].join('\n')

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

if (values['make-split']) {
  // 分割を固定する。AI は呼ばない。既存の split.json は上書きしない。
  const dev = await readSelection(DEV_DIRECTORY)
  const extra = await loadSidelinedCases(resolve(values.cases), EXTRA_BUCKETS['extra-post-after-start'])
  const split = buildSplit({
    main: loaded.cases,
    extra,
    devCaseIds: dev.cases.map((sample) => sample.caseId),
    devSelectionSha256: dev.caseIdsSha256,
    casesSha256: loaded.sha256
  })
  await writeJson(resolve(values['split-file']), split, 'wx')
  console.log(
    JSON.stringify(
      {
        splitFile: values['split-file'],
        splitSha256: split.splitSha256,
        dev: { posts: split.dev.posts, events: split.dev.events, caseIdsSha256: split.dev.caseIdsSha256 },
        test: { posts: split.test.posts, events: split.test.events, caseIdsSha256: split.test.caseIdsSha256 },
        extra: Object.fromEntries(
          Object.entries(split.extra).map(([name, group]) => [
            name,
            { posts: group.posts, events: group.events, caseIdsSha256: group.caseIdsSha256 }
          ])
        ),
        calls: 0
      },
      null,
      2
    )
  )
} else if (values.score !== undefined && splitNames !== null) {
  // 分割ごとの採点（現行ソースの評価で再評価）。AI は呼ばず、測定の出力先は読むだけ。結果は --out の配下へ分割ごとに書く。
  if (values.out === undefined) throw new Error('--out is required when scoring a split')
  const { scoreSplit, writeSummary } = await import('./lib/event-detect/d1-gold-baseline')
  const module = await loadGoalPipelineModule(resolve(values.module))
  if (!module.sha256.startsWith(EXPECTED_BUNDLE_PREFIX)) throw new Error('Unexpected frozen pipeline bundle')
  const split = await loadSplit(resolve(values['split-file']), loaded.sha256)
  const extra = await loadSidelinedCases(resolve(values.cases), EXTRA_BUCKETS['extra-post-after-start'])
  const outDirectory = assertOwnDirectory(values.out)
  // 開発用は前回の測定の出力先から、それ以外は --score の出力先から読む（取り違えると全投稿が未着手になる）。
  const scoreDirectory = assertOwnDirectory(values.score)
  const runDirectoryOf = (name: (typeof splitNames)[number]) =>
    name === 'dev' ? resolve(DEV_DIRECTORY) : scoreDirectory
  const reports = await Promise.all(
    splitNames.map(
      async (name) =>
        await scoreSplit({
          module,
          split,
          pool: [...loaded.cases, ...extra],
          name,
          runDirectory: runDirectoryOf(name),
          outDirectory,
          root: process.cwd()
        })
    )
  )
  console.log(await writeSummary(outDirectory))
  for (const report of reports) {
    const { calibration } = report.integrity
    if (
      calibration !== null &&
      (calibration.expected.registered !== calibration.actual.registered ||
        calibration.expected.exact !== calibration.actual.exact)
    )
      console.log(`CALIBRATION MISMATCH on ${report.name}: ${JSON.stringify(calibration)}`)
  }
} else if (values.score !== undefined) {
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
} else if (!values.live && values.split !== undefined) {
  const plan = await loadPlan()
  if (plan === null) throw new Error('No split plan')
  console.log(
    JSON.stringify(
      {
        mode: 'offline-d1-gold-split-inventory',
        splitSha256: plan.split.splitSha256,
        names: plan.names,
        excluded: 'excluded' in plan ? plan.excluded : [],
        posts: plan.cases.length,
        events: plan.cases.reduce((sum, sample) => sum + sample.events.length, 0),
        caseIdsSha256: plan.caseIdsSha256,
        firstCaseIds: plan.caseIds.slice(0, 5),
        callEstimate: {
          perPostMeanFromPriorRun: PRIOR_MEAN_CALLS,
          expected: Math.round(plan.cases.length * PRIOR_MEAN_CALLS),
          structuralMinimum: plan.cases.reduce((sum, sample) => sum + 2 + sample.events.length, 0),
          structuralMaximum: plan.cases.reduce((sum, sample) => sum + 3 + sample.events.length + 1, 0)
        },
        callLimit: D1_GOLD_SPLIT_CALL_LIMIT,
        calls: 0
      },
      null,
      2
    )
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
  const plan = await loadPlan()
  // 追加の別枠だけが持つ除外の一覧。あれば、その入力と出力先の検査・書き出しは専用の処理に任せる。
  const extraPlan = plan !== null && 'excluded' in plan ? plan : null
  // 開発用の投稿は測定済み。実 AI へ再送しない。
  if (plan?.names.includes('dev')) throw new Error('Refusing to send the dev split again')
  const ceiling = plan === null ? D1_GOLD_CALL_LIMIT : D1_GOLD_SPLIT_CALL_LIMIT
  const cases = plan === null ? selected.cases : plan.cases
  const caseIdsSha256 = plan === null ? selected.selection.caseIdsSha256 : plan.caseIdsSha256
  const directory = assertOwnDirectory(values.directory)
  if (plan !== null && directory === resolve(DEV_DIRECTORY))
    throw new Error('A split run must not use the dev directory')
  const maxCalls = values['max-calls'] === undefined ? ceiling : Number(values['max-calls'])
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > ceiling) throw new Error('Invalid call limit')
  const module = await loadGoalPipelineModule(resolve(values.module))
  if (!module.sha256.startsWith(EXPECTED_BUNDLE_PREFIX)) throw new Error('Unexpected frozen pipeline bundle')
  const profileSha = sha256Hex(await readFile('.wrangler/production-sync/goal-runtime-profile.json'))
  if (profileSha !== GOAL_PIPELINE_PROFILE.snapshotFileSha256) throw new Error('Runtime profile snapshot hash mismatch')
  const origin = new URL(values.decide).origin
  const health = await fetch(`${origin}/api/events`)
  if (health.status !== 200) throw new Error(`Dev server health check failed: HTTP ${health.status}`)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const selectionPath = resolve(directory, 'selection.json')
  if (extraPlan !== null) await prepareExtraStartDirectory(directory, extraPlan, maxCalls)
  else if (await Bun.file(selectionPath).exists()) {
    const saved = await readSelection(directory)
    if (saved.caseIdsSha256 !== caseIdsSha256) throw new Error('Saved selection differs from the planned cases')
  } else {
    const selectionBody =
      plan === null
        ? { inputSha256: loaded.sha256, selection: selected.selection }
        : {
            inputSha256: loaded.sha256,
            selection: { caseIds: plan.caseIds, forcedCaseIds: [], caseIdsSha256: plan.caseIdsSha256 },
            split: { names: plan.names, splitSha256: plan.split.splitSha256 }
          }
    await writeJson(selectionPath, selectionBody, 'wx')
    await writeJson(resolve(directory, 'gold.json'), goldBundleOf(cases, loaded.sha256), 'wx')
    await writeFile(resolve(directory, 'README.md'), `${plan === null ? README : SPLIT_README}\n`, {
      mode: 0o600,
      flag: 'wx'
    })
  }
  if (!GoldBundleSchema.safeParse(JSON.parse(await readFile(resolve(directory, 'gold.json'), 'utf8'))).success)
    throw new Error('Invalid gold.json')
  const summary = await runGoldCohort({
    module,
    cases,
    directory,
    maxCalls,
    maxSeconds: Number(values['max-seconds']),
    decideEndpoint: values.decide,
    extractionEndpoint: values.extract,
    callCeiling: ceiling
  })
  console.log(JSON.stringify(summary, null, 2))
}
