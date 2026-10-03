import { expect, mock, test } from 'bun:test'
import {
  assertReplacementReady,
  planTimelineCutover,
  stopOldTimeline,
  timelineCron
} from '../scripts/bot-cutover-state'

const now = Date.parse('2026-10-03T22:40:00Z')
const inspection = {
  inspectedAt: new Date(now).toISOString(),
  accountId: 'synthetic-account',
  script: 'musume-workers',
  schedules: [{ cron: timelineCron }],
  missingBindings: [],
  deployments: [
    {
      id: 'synthetic-deployment',
      created_on: '2026-10-03T00:00:00Z',
      versions: [{ version_id: 'synthetic-version', percentage: 100 }]
    }
  ]
}

test('cutover plan preserves an explicit rollback target and the original cron', () => {
  expect(planTimelineCutover(inspection, now)).toEqual({
    accountId: 'synthetic-account',
    script: 'musume-workers',
    previousDeploymentId: 'synthetic-deployment',
    previousVersionId: 'synthetic-version',
    previousSchedules: [{ cron: timelineCron }]
  })
})

test('stale, future, incomplete, gradual and unexpected cron inspections are rejected', () => {
  expect(() => planTimelineCutover(inspection, now + 5 * 60 * 1000 + 1)).toThrow('stale')
  expect(() => planTimelineCutover(inspection, now - 1)).toThrow('stale')
  expect(() => planTimelineCutover({ ...inspection, missingBindings: ['OPENAI_API_KEY'] }, now)).toThrow('missing')
  expect(() =>
    planTimelineCutover(
      {
        ...inspection,
        deployments: [{ ...inspection.deployments[0], versions: [{ version_id: 'partial', percentage: 50 }] }]
      },
      now
    )
  ).toThrow('ambiguous')
  expect(() => planTimelineCutover({ ...inspection, schedules: [{ cron: '0 0 * * *' }] }, now)).toThrow(
    'Unexpected old cron'
  )
  expect(() => planTimelineCutover({}, now)).toThrow('Invalid cutover inspection')
})

test('old cron stop rechecks deployment/schedules, clears only cron, and records a conservative drain period', async () => {
  const calls: unknown[] = []
  let cleared = false
  const request = mock(async (path: string, method?: 'GET' | 'PUT', body?: unknown) => {
    calls.push({ path, method, body })
    if (path.endsWith('/deployments')) return { deployments: [{ id: 'synthetic-deployment' }] }
    if (method === 'PUT') {
      cleared = true
      return { schedules: [] }
    }
    return { schedules: cleared ? [] : [{ cron: timelineCron }] }
  })
  const checkpoint = await stopOldTimeline(planTimelineCutover(inspection, now), request, () => now + 10000)
  expect(calls).toEqual([
    {
      path: '/accounts/synthetic-account/workers/scripts/musume-workers/deployments',
      method: undefined,
      body: undefined
    },
    {
      path: '/accounts/synthetic-account/workers/scripts/musume-workers/schedules',
      method: undefined,
      body: undefined
    },
    { path: '/accounts/synthetic-account/workers/scripts/musume-workers/schedules', method: 'PUT', body: [] },
    { path: '/accounts/synthetic-account/workers/scripts/musume-workers/schedules', method: undefined, body: undefined }
  ])
  expect(checkpoint.previousVersionId).toBe('synthetic-version')
  expect(checkpoint.earliestReplacementAt).toBe('2026-10-03T23:10:10.000Z')
  expect(() => assertReplacementReady(checkpoint, now + 30 * 60 * 1000)).toThrow('has not elapsed')
  expect(() => assertReplacementReady(checkpoint, now + 30 * 60 * 1000 + 10000)).not.toThrow()
})

test('deployment or schedule drift prevents the first mutation', async () => {
  const moved = mock(async () => ({ deployments: [{ id: 'new-deployment' }] }))
  await expect(stopOldTimeline(planTimelineCutover(inspection, now), moved, () => now)).rejects.toThrow(
    'Deployment changed'
  )
  expect(moved).toHaveBeenCalledTimes(1)
  const schedules = mock(async (path: string) =>
    path.endsWith('/deployments') ? { deployments: [{ id: 'synthetic-deployment' }] } : { schedules: [] }
  )
  await expect(stopOldTimeline(planTimelineCutover(inspection, now), schedules, () => now)).rejects.toThrow(
    'Schedules changed'
  )
  expect(schedules).toHaveBeenCalledTimes(2)
})

test('a clear response without independently confirmed empty schedules is not success', async () => {
  const request = mock(async (path: string) =>
    path.endsWith('/deployments')
      ? { deployments: [{ id: 'synthetic-deployment' }] }
      : { schedules: [{ cron: timelineCron }] }
  )
  await expect(stopOldTimeline(planTimelineCutover(inspection, now), request, () => now)).rejects.toThrow(
    'stop was not confirmed'
  )
})

test('requested, malformed and shortened checkpoints never satisfy the drain gate', () => {
  expect(() => assertReplacementReady({ stage: 'stop_requested' }, now)).toThrow('not recorded')
  expect(() =>
    assertReplacementReady({ stage: 'old_cron_removed', stoppedAt: 'invalid', earliestReplacementAt: 'invalid' }, now)
  ).toThrow('not recorded')
  expect(() =>
    assertReplacementReady(
      {
        stage: 'old_cron_removed',
        stoppedAt: new Date(now).toISOString(),
        earliestReplacementAt: new Date(now).toISOString()
      },
      now
    )
  ).toThrow('has not elapsed')
})
