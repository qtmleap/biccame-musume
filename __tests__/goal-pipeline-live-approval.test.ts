import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadExpandedGoalCorpus,
  selectExpandedGoalCohort
} from '../scripts/lib/event-detect/goal-pipeline-expanded-corpus'
import {
  loadAnnotatedGoalCorpus,
  selectAnnotatedGoalCohort
} from '../scripts/lib/event-detect/goal-pipeline-goal-corpus'
import { isLiveApprovalFor, type LiveApprovalTarget } from '../scripts/lib/event-detect/goal-pipeline-live-approval'
import { fixtureProvenance, fixtureRows, writeExpandedFixture } from './fixtures/expanded-corpus'

const target = (caseHash: string): LiveApprovalTarget => ({
  baselineBundleSha256: 'b'.repeat(64),
  candidateBundleSha256: 'c'.repeat(64),
  caseHash,
  operatorPolicyHash: 'o'.repeat(64),
  profileHash: 'p'.repeat(64),
  adapterHash: 'a'.repeat(64)
})
const approvalFor = (value: LiveApprovalTarget) => ({ decision: 'approved', liveEvaluationApproved: true, ...value })

const directory = await mkdtemp(join(tmpdir(), 'live-approval-'))
const rows = fixtureRows(50)
await writeExpandedFixture(directory, rows, fixtureProvenance(rows, 586))
const goalHash = selectAnnotatedGoalCohort((await loadAnnotatedGoalCorpus()).cases, 100, 'goal-pipeline-v1').inputHash
const expandedHash = selectExpandedGoalCohort(
  await loadExpandedGoalCorpus(directory),
  100,
  'expanded-v2-pipeline-v1'
).inputHash
await rm(directory, { recursive: true, force: true })

test('an approval written for the goal 100 cohort cannot authorize the expanded cohort', () => {
  expect(goalHash).not.toBe(expandedHash)
  expect(isLiveApprovalFor(approvalFor(target(goalHash)), target(goalHash))).toBe(true)
  expect(isLiveApprovalFor(approvalFor(target(goalHash)), target(expandedHash))).toBe(false)
  expect(isLiveApprovalFor(approvalFor(target(expandedHash)), target(goalHash))).toBe(false)
})

test('every bound hash is required to match, so a changed bundle, observer, profile or adapter is rejected', () => {
  const approved = approvalFor(target(expandedHash))
  const keys = [
    'baselineBundleSha256',
    'candidateBundleSha256',
    'caseHash',
    'operatorPolicyHash',
    'profileHash',
    'adapterHash'
  ] as const
  for (const key of keys)
    expect(isLiveApprovalFor(approved, { ...target(expandedHash), [key]: 'x'.repeat(64) })).toBe(false)
  expect(isLiveApprovalFor(approved, target(expandedHash))).toBe(true)
})

test('rejected, missing or malformed approvals never authorize live evaluation', () => {
  const live = target(expandedHash)
  expect(isLiveApprovalFor({ ...approvalFor(live), decision: 'rejected' }, live)).toBe(false)
  expect(isLiveApprovalFor({ ...approvalFor(live), liveEvaluationApproved: false }, live)).toBe(false)
  expect(isLiveApprovalFor(null, live)).toBe(false)
  expect(isLiveApprovalFor({}, live)).toBe(false)
  expect(isLiveApprovalFor('approved', live)).toBe(false)
})
