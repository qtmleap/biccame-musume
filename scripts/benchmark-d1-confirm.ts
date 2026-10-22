import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { EXPECTED_BASELINE, loadDeskInputs, SAVED_AUDIT_THRESHOLD } from './lib/event-detect/d1-confirm-desk'
import {
  buildPlan,
  loadFacts,
  type PlanItem,
  planSha256,
  readRecords,
  savedJudgeInputTokens
} from './lib/event-detect/d1-confirm-plan'
import {
  characterSection,
  comparisonSection,
  costSection,
  deskSection,
  deskUnmeasured,
  type Observation,
  observe,
  passedDecoySection,
  storeSection
} from './lib/event-detect/d1-confirm-report'
import { isConcreteCharacter, isConcreteStore } from './lib/event-detect/d1-confirm-requests'
import { D1_CONFIRM_CALL_LIMIT, readItemStates, runConfirm } from './lib/event-detect/d1-confirm-run'
import { countByKey, loadGoldCases } from './lib/event-detect/d1-gold-schema'

const ROOT = '.wrangler/benchmarks/d1-gold'
const SOURCE = `${ROOT}/run-v15-100`
const DEFAULT_OUTPUT = `${ROOT}/confirm-v15`

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    plan: { type: 'boolean', default: false },
    live: { type: 'boolean', default: false },
    report: { type: 'boolean', default: false },
    pilot: { type: 'string' },
    cases: { type: 'string', default: `${ROOT}/cases.json` },
    source: { type: 'string', default: SOURCE },
    directory: { type: 'string', default: DEFAULT_OUTPUT },
    'max-calls': { type: 'string', default: String(D1_CONFIRM_CALL_LIMIT) },
    'max-seconds': { type: 'string', default: '7200' },
    decide: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/decide' },
    extract: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/extract-evaluate' }
  },
  strict: true
})

// 出力先はこの測定専用のディレクトリだけ。既存のベンチマーク出力には書かない。
const outputDirectory = resolve(values.directory)
if (!outputDirectory.startsWith(`${resolve(ROOT)}${sep}`) || outputDirectory.includes(`${sep}run-v15-100`))
  throw new Error('Output must stay under the d1-gold directory and outside the saved run')
const writeJson = async (name: string, value: unknown) =>
  await writeFile(resolve(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })

const loaded = await loadGoldCases(resolve(values.cases))
const golds = new Map(loaded.cases.map((sample) => [sample.caseId, sample.events]))
const sourceDirectory = resolve(values.source)
const { facts, integrity } = await loadFacts(sourceDirectory, golds)
const plan = buildPlan(facts)

const keyOf = (item: PlanItem) => `${item.caseId}#${item.index}`
const candidateKeys = [...new Set(plan.map(keyOf))]

const planSummary = () => {
  const t = plan.filter((item) => item.kind === 'T')
  const d = plan.filter((item) => item.kind === 'D')
  const withStore = (items: readonly PlanItem[]) => items.filter((item) => item.storeTarget !== null)
  const withCharacter = (items: readonly PlanItem[]) => items.filter((item) => item.characterTarget !== null)
  return {
    mode: 'offline-plan',
    planSha256: planSha256(plan),
    candidatesWithD1Match: facts.length,
    integrity,
    candidates: candidateKeys.length,
    items: plan.length,
    expectedCalls: plan.length,
    callLimit: D1_CONFIRM_CALL_LIMIT,
    T: { items: t.length, store: withStore(t).length, character: withCharacter(t).length },
    D: { items: d.length, store: withStore(d).length, character: withCharacter(d).length },
    characterBasis: countByKey(withCharacter(t), (item) => String(item.characterBasis)),
    storeEqualsHint: {
      T: countByKey(withStore(t), (item) => String(item.storeEqualsHint)),
      D: countByKey(withStore(d), (item) => String(item.storeEqualsHint))
    },
    characterSameIdAsStore: {
      T: countByKey(withCharacter(t), (item) => String(item.characterSameIdAsStore)),
      D: countByKey(withCharacter(d), (item) => String(item.characterSameIdAsStore))
    },
    storeTargetIsChoiceTop: countByKey(withStore(t), (item) => String(item.storeIsChoiceTop)),
    characterTargetIsChoiceTop: countByKey(withCharacter(t), (item) => String(item.characterIsChoiceTop)),
    candidatesWithoutD: candidateKeys.filter((key) => !d.some((item) => keyOf(item) === key)).length
  }
}

if (values.plan) {
  const summary = planSummary()
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 })
  await writeJson('plan.json', { summary, items: plan })
  console.log(JSON.stringify(summary, null, 2))
} else if (values.live) {
  const maxCalls = Number(values['max-calls'])
  const origin = new URL(values.decide).origin
  const health = await fetch(`${origin}/api/events`)
  if (health.status !== 200) throw new Error(`Dev server health check failed: HTTP ${health.status}`)
  const pilot = values.pilot === undefined ? null : Number(values.pilot)
  if (pilot !== null && (!Number.isInteger(pilot) || pilot < 1 || pilot > 5)) throw new Error('Invalid pilot size')
  // 予備実行は、T と D の両方がある先頭の候補だけ。質問文は予備実行のあとで変えない。
  const only =
    pilot === null
      ? undefined
      : new Set(
          candidateKeys
            .filter((key) => ['T', 'D'].every((kind) => plan.some((item) => keyOf(item) === key && item.kind === kind)))
            .slice(0, pilot)
            .flatMap((key) => plan.filter((item) => keyOf(item) === key).map((item) => item.itemId))
        )
  const summary = await runConfirm({
    items: plan,
    ...(only === undefined ? {} : { only }),
    directory: outputDirectory,
    maxCalls,
    maxSeconds: Number(values['max-seconds']),
    decideEndpoint: values.decide,
    extractionEndpoint: values.extract
  })
  console.log(JSON.stringify(summary, null, 2))
} else if (values.report) {
  const states = await readItemStates(outputDirectory, plan)
  const observations: Observation[] = plan.flatMap((item) => {
    const state = states.get(item.itemId)
    return state === undefined || state.result === null ? [] : [observe(item, state.result)]
  })
  const desk = await loadDeskInputs(sourceDirectory, golds, process.cwd())
  const records = await readRecords(sourceDirectory)
  const savedCalls = records.reduce((sum, record) => sum + record.calls, 0)
  const real = records.flatMap((record) => record.candidates.filter((candidate) => !candidate.contextOnly))
  const needingConfirm = real.filter(
    (candidate) =>
      (candidate.view.store !== null && isConcreteStore(candidate.view.store.choice)) ||
      (candidate.view.character !== null && isConcreteCharacter(candidate.view.character.choice))
  ).length
  const judgeInputTokens = await savedJudgeInputTokens(sourceDirectory)
  const drift =
    desk.baseline.registered !== EXPECTED_BASELINE.registered || desk.baseline.exact !== EXPECTED_BASELINE.exact
  const failedItems = plan.filter((item) => {
    const state = states.get(item.itemId)
    return state !== undefined && state.result === null
  })
  const ledgerRaw = await readFile(resolve(outputDirectory, 'live-attempts.jsonl'), 'utf8').catch(() => '')
  const ledgerLines = ledgerRaw.split('\n').filter((line) => line !== '').length
  const sections = [
    `Plan ${planSha256(plan)}: ${plan.length} items, ${observations.length} answered, ${failedItems.length} without a result; ledger ${ledgerLines}/${D1_CONFIRM_CALL_LIMIT} calls`,
    [
      `Desk inputs: detection.ts sha256 ${desk.sourceSha256.detection}`,
      `             detection-conditions.ts sha256 ${desk.sourceSha256.detectionConditions}`,
      `             packages/shared/src/event-detect (non-test .ts) sha256 ${desk.sourceSha256.eventDetectDirectory}`
    ].join('\n'),
    `Desk baseline (no confirm gate, no audit) ${drift ? 'DRIFTED' : 'reproduced'}: ${desk.baseline.registered} registered / ${desk.baseline.exact} exact (expected ${EXPECTED_BASELINE.registered} / ${EXPECTED_BASELINE.exact})`,
    `Audit parity at the saved threshold ${SAVED_AUDIT_THRESHOLD}: ${desk.auditParity.checked - desk.auditParity.mismatched}/${desk.auditParity.checked} cases match the saved audit${desk.auditParity.mismatched === 0 ? '' : ' (MISMATCH: the 0.7 desk is not interpretable)'}`,
    storeSection(observations),
    passedDecoySection(observations),
    characterSection(observations),
    comparisonSection(observations),
    deskSection(desk, observations),
    `Desk unmeasured breakdown (registered at top-one, no audit): ${JSON.stringify(deskUnmeasured(desk, observations))}`,
    costSection(observations, { realCandidates: real.length, needingConfirm, savedCalls, judgeInputTokens })
  ]
  const text = `${sections.join('\n\n')}\n`
  await writeFile(resolve(outputDirectory, 'report.txt'), text, { mode: 0o600 })
  await writeJson(
    'observations.json',
    observations.map((o) => ({ ...o, item: { ...o.item, request: undefined } }))
  )
  console.log(text)
} else {
  console.log(JSON.stringify(planSummary(), null, 2))
}
