import { z } from 'zod'

export const timelineCron = '*/5 0-12 * * *'
const scheduleSchema = z.object({ cron: z.string().nonempty() })
const versionSchema = z.object({ version_id: z.string().nonempty(), percentage: z.number() })
const inspectionSchema = z.object({
  inspectedAt: z.iso.datetime(), accountId: z.string().nonempty(), script: z.literal('musume-workers'),
  schedules: z.array(scheduleSchema), missingBindings: z.array(z.string().nonempty()),
  deployments: z.array(z.object({
    id: z.string().nonempty(), created_on: z.string().nonempty(), versions: z.array(versionSchema)
  })).nonempty()
})

export const planTimelineCutover = (input: unknown, now: number) => {
  const parsed = inspectionSchema.safeParse(input)
  if (!parsed.success) throw new Error('Invalid cutover inspection; rerun read-only inspection')
  const inspection = parsed.data
  const age = now - Date.parse(inspection.inspectedAt)
  if (age < 0 || age > 5 * 60 * 1000) throw new Error('Cutover inspection is stale; rerun read-only inspection')
  if (inspection.missingBindings.length) throw new Error('Required bot bindings are missing; do not cut over')
  const latest = inspection.deployments[0]
  if (latest.versions.length !== 1 || latest.versions[0].percentage !== 100) {
    throw new Error('Gradual or ambiguous deployment; capture an explicit rollback target first')
  }
  if (inspection.schedules.length > 1 || inspection.schedules.some((schedule) => schedule.cron !== timelineCron)) {
    throw new Error('Unexpected old cron configuration; do not overwrite it')
  }
  return {
    accountId: inspection.accountId, script: inspection.script,
    previousDeploymentId: latest.id, previousVersionId: latest.versions[0].version_id,
    previousSchedules: inspection.schedules
  }
}

export type CutoverPlan = ReturnType<typeof planTimelineCutover>
type ApiRequest = (path: string, method?: 'GET' | 'PUT', body?: unknown) => Promise<unknown>

export const stopOldTimeline = async (plan: CutoverPlan, request: ApiRequest, clock: () => number) => {
  const base = `/accounts/${plan.accountId}/workers/scripts/${plan.script}`
  const current = z.object({ deployments: z.array(z.object({ id: z.string().nonempty() })).nonempty() })
    .safeParse(await request(`${base}/deployments`))
  if (!current.success || current.data.deployments[0].id !== plan.previousDeploymentId) {
    throw new Error('Deployment changed after inspection; do not stop or overwrite the Worker')
  }
  const readSchedules = async () => {
    const parsed = z.object({ schedules: z.array(scheduleSchema) }).safeParse(await request(`${base}/schedules`))
    if (!parsed.success) throw new Error('Invalid schedule metadata')
    return parsed.data.schedules
  }
  if (JSON.stringify(await readSchedules()) !== JSON.stringify(plan.previousSchedules)) {
    throw new Error('Schedules changed after inspection; do not overwrite them')
  }
  await request(`${base}/schedules`, 'PUT', [])
  if ((await readSchedules()).length !== 0) throw new Error('Old cron stop was not confirmed; do not deploy')
  // 最大15分の伝播 + 最大15分の既に開始済みscheduled実行の終了待ち。
  const now = clock()
  return {
    ...plan, stage: 'old_cron_removed', stoppedAt: new Date(now).toISOString(),
    earliestReplacementAt: new Date(now + 30 * 60 * 1000).toISOString()
  }
}

export const assertReplacementReady = (input: unknown, now: number): void => {
  const parsed = z.object({
    stage: z.literal('old_cron_removed'), stoppedAt: z.iso.datetime(), earliestReplacementAt: z.iso.datetime()
  }).safeParse(input)
  if (!parsed.success) throw new Error('Old cron stop is not recorded')
  const stopped = Date.parse(parsed.data.stoppedAt)
  const earliest = Date.parse(parsed.data.earliestReplacementAt)
  if (earliest < stopped + 30 * 60 * 1000 || now < earliest || !Number.isFinite(now)) {
    throw new Error('Cron propagation/in-flight drain period has not elapsed')
  }
}
