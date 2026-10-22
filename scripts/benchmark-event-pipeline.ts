import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { runGoalPipelineCohort } from './lib/event-detect/goal-pipeline-cohort'
import {
  assertBenchmarkDirectory,
  PIPELINE_DATASETS,
  PipelineDatasetSchema,
  resolvePipelineCohort
} from './lib/event-detect/goal-pipeline-dataset'
import { isLiveApprovalFor } from './lib/event-detect/goal-pipeline-live-approval'
import { goalHash, loadGoalPipelineModule } from './lib/event-detect/goal-pipeline-module'
import { readGoalD1References } from './lib/event-detect/goal-pipeline-d1'
import { compareGoalDiscovery } from './lib/event-detect/goal-pipeline-compare'
import { GOAL_PIPELINE_PROFILE } from './lib/event-detect/goal-pipeline-profile'
import { createGoalPhaseBudget } from './lib/event-detect/goal-pipeline-budget'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    live: { type: 'boolean', default: false },
    baseline: { type: 'string' },
    candidate: { type: 'string' },
    d1: { type: 'string' },
    dataset: { type: 'string', default: 'goal' },
    approval: { type: 'string' },
    size: { type: 'string' },
    'corpus-directory': { type: 'string' },
    seed: { type: 'string' },
    directory: { type: 'string' },
    'max-calls': { type: 'string', default: '1200' },
    'max-seconds': { type: 'string', default: '7200' },
    decide: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/decide' },
    extract: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/extract-evaluate' }
  },
  strict: true
})
// 保存先・承認ファイル・seedはdatasetごとの既定を使う。別datasetの凍結cohortや承認は既定で拾わない。
const dataset = PipelineDatasetSchema.safeParse(values.dataset)
if (!dataset.success) throw new Error('Unknown pipeline dataset')
const defaults = PIPELINE_DATASETS[dataset.data]
const directory = resolve(values.directory === undefined ? defaults.directory : values.directory)
assertBenchmarkDirectory(directory)
const seed = values.seed === undefined ? defaults.seed : values.seed
const approvalPath = values.approval === undefined ? defaults.approval : values.approval
const { corpus, selected, saved, selectionPath } = await resolvePipelineCohort({
  kind: dataset.data,
  corpusDirectory: values['corpus-directory'],
  directory,
  size: values.size === undefined ? undefined : Number(values.size),
  seed
})
const references =
  values.d1 === undefined ? null : readGoalD1References(values.d1, [...selected.cases, ...selected.diagnostic])
const budget = Number(values['max-calls'])
if (!Number.isInteger(budget) || budget < 1 || budget > 1200) throw new Error('Invalid phase budget')
if (!values.live) {
  console.log(
    JSON.stringify(
      {
        mode: 'offline-pipeline-inventory',
        dataset: corpus.kind,
        selectionProvenance: 'selection' in selected ? selected.selection : null,
        rawCases: corpus.rawCount,
        uniqueCases: corpus.cases.length,
        selected: selected.size,
        positive: selected.positive,
        negative: selected.negative,
        diagnostic: selected.diagnostic.length,
        seed: selected.seed,
        caseHash: selected.inputHash,
        d1References: references === null ? null : { inspected: references.cases, found: references.found },
        calls: 0,
        note: 'Extraction, item count auditing, focused inputs and judgement are evaluated as separate stages. Provisional labels.'
      },
      null,
      2
    )
  )
} else {
  if (values.baseline === undefined || values.candidate === undefined)
    throw new Error('Live paired evaluation requires frozen --baseline and --candidate')
  const baseline = await loadGoalPipelineModule(resolve(values.baseline))
  const candidate = await loadGoalPipelineModule(resolve(values.candidate))
  const operatorProof = candidate.groundedDiscoveryProof
  if (operatorProof === undefined) throw new Error('Candidate must export the reviewed common operator proof function')
  const operatorPolicyHash = goalHash({
    observerSource: await readFile(new URL('./lib/event-detect/goal-pipeline-operator.ts', import.meta.url), 'utf8'),
    proofBundleSha256: candidate.sha256
  })
  const snapshotSha = createHash('sha256')
    .update(await readFile('.wrangler/production-sync/goal-runtime-profile.json'))
    .digest('hex')
  if (snapshotSha !== GOAL_PIPELINE_PROFILE.snapshotFileSha256)
    throw new Error('Runtime profile snapshot hash mismatch')
  const profileHash = goalHash(GOAL_PIPELINE_PROFILE)
  const adapterHash = goalHash(
    await Promise.all(
      ['run', 'module', 'client', 'cohort', 'score', 'input', 'operator', 'profile', 'budget', 'stages', 'schema'].map(
        async (part) => ({
          part,
          source: await readFile(new URL(`./lib/event-detect/goal-pipeline-${part}.ts`, import.meta.url), 'utf8')
        })
      )
    )
  )
  const smoke = z
    .object({ completed: z.literal(true), attempts: z.number().int().min(0).max(20) })
    .safeParse(await Bun.file('.wrangler/production-sync/goal-live-smoke-result.json').json())
  if (!smoke.success) throw new Error('Phase smoke ledger is missing or invalid')
  const phasePriorCalls = smoke.data.attempts
  const availableBudget = Math.min(budget, 1200 - phasePriorCalls)
  const approval: unknown = await Bun.file(approvalPath)
    .json()
    .catch(() => null)
  if (
    !isLiveApprovalFor(approval, {
      baselineBundleSha256: baseline.sha256,
      candidateBundleSha256: candidate.sha256,
      caseHash: selected.inputHash,
      operatorPolicyHash,
      profileHash,
      adapterHash
    })
  )
    throw new Error('Live evaluation requires an approved safety gate for these exact pipeline bundles and cases')
  const phaseBudget = await createGoalPhaseBudget(resolve('.wrangler/benchmarks/goal-pipeline'), phasePriorCalls)
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (saved === null)
      await writeFile(selectionPath, JSON.stringify(selected, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    if (references !== null && !(await Bun.file(resolve(directory, 'historical-d1-reference.json')).exists()))
      await writeFile(resolve(directory, 'historical-d1-reference.json'), JSON.stringify(references, null, 2) + '\n', {
        mode: 0o600,
        flag: 'wx'
      })
    const common = {
      operatorProof,
      operatorPolicyHash,
      cases: selected.cases,
      maxSeconds: Number(values['max-seconds']),
      decideEndpoint: values.decide,
      extractionEndpoint: values.extract,
      reservePhaseAttempt: phaseBudget.reserve
    }
    const before = await runGoalPipelineCohort({
      ...common,
      module: baseline,
      directory: resolve(directory, 'baseline'),
      maxCalls: availableBudget
    })
    if (before.haltedOnTransportError || before.completed !== selected.size)
      throw new Error('Baseline phase stopped; candidate was not sent')
    const remaining = availableBudget - before.calls
    if (remaining < 1) throw new Error('Baseline consumed the complete paired phase budget')
    const after = await runGoalPipelineCohort({
      ...common,
      module: candidate,
      directory: resolve(directory, 'candidate'),
      maxCalls: remaining
    })
    const comparable =
      before.transportErrors === 0 &&
      after.transportErrors === 0 &&
      before.completed === selected.size &&
      after.completed === selected.size
    const delta = comparable && before.recall !== null && after.recall !== null ? after.recall - before.recall : null
    const paired = compareGoalDiscovery(before.rows, after.rows, selected.cases)
    const acceptance = {
      minimumRecallGain: 0.2,
      falsePositiveIncreaseAllowed: 0,
      maximumPairedP: 0.05,
      maximumCandidateErrors: 0,
      baselineValidationFailuresCountAsMisses: true,
      passed:
        comparable &&
        after.errors === 0 &&
        delta !== null &&
        delta >= 0.2 &&
        after.FP <= before.FP &&
        paired.gained > paired.lost &&
        paired.exactTwoSidedP < 0.05
    }
    const report = {
      mode: 'live-pipeline-comparison',
      provisionalLabels: true,
      goalAchieved: false,
      requiresIndependentDiscoveryReview: true,
      primaryMetricScope: 'symmetric-operator-visible-candidates-not-automatic-registration',
      comparable,
      paired,
      acceptance,
      seed: selected.seed,
      caseHash: selected.inputHash,
      calls: before.calls + after.calls,
      phaseCalls: phaseBudget.used(),
      phasePriorCalls,
      budget: availableBudget,
      profile: GOAL_PIPELINE_PROFILE,
      profileHash,
      adapterHash,
      baseline: before,
      candidate: after,
      improvement: delta,
      note: 'Discovery is not automatic registration. Errors and unknown fields are kept explicit. Original webhook rows and notifications are unchanged.'
    }
    await writeFile(resolve(directory, 'comparison.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await phaseBudget.close()
  }
}
