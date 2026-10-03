import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { planTimelineCutover, stopOldTimeline } from './bot-cutover-state'

// 本番切替承認後にユーザー認証で実行する。Workerのコード・secretは変更しない。
if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..')
  const checkpointPath = resolve(root, '.cache/bot-cutover-checkpoint.json')
  if (existsSync(checkpointPath)) throw new Error('A cutover checkpoint already exists; do not overwrite rollback evidence')
  const now = Date.now()
  const plan = planTimelineCutover(JSON.parse(readFileSync(resolve(root, '.cache/bot-cutover-inspection.json'), 'utf8')), now)
  const gh = async (args: string[]) => {
    const child = Bun.spawn(['gh', ...args], { stdout: 'pipe', stderr: 'ignore' })
    const output = await new Response(child.stdout).text()
    if (await child.exited !== 0) throw new Error('GitHub workflow state could not be verified')
    return output.trim()
  }
  const state = await gh(['api', 'repos/qtmleap/biccame-musume-workers/actions/workflows/321445935', '--jq', '.state'])
  if (state !== 'disabled_manually') throw new Error('Disable the legacy deployment workflow before stopping cron')
  const runs = z.array(z.object({ status: z.string().nonempty() })).safeParse(JSON.parse(await gh([
    'run', 'list', '--repo', 'qtmleap/biccame-musume-workers', '--workflow', 'deployment.yaml', '--limit', '100', '--json', 'status'
  ])))
  if (!runs.success || runs.data.some((run) => run.status !== 'completed')) throw new Error('Legacy deploy runs are still active')
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required')
  const envelope = z.object({ success: z.boolean(), result: z.unknown(), errors: z.array(z.object({ code: z.number() })).optional() })
  writeFileSync(checkpointPath, JSON.stringify({ ...plan, stage: 'stop_requested', requestedAt: new Date().toISOString() }, null, 2), { flag: 'wx' })
  const checkpoint = await stopOldTimeline(plan, async (path, method = 'GET', body) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000), redirect: 'error'
    })
    const parsed = envelope.safeParse(await response.json())
    if (!parsed.success) throw new Error(`Cloudflare metadata validation failed (HTTP ${response.status})`)
    if (!response.ok || !parsed.data.success) throw new Error(`Cloudflare operation failed (HTTP ${response.status}; codes=${parsed.data.errors?.map((error) => error.code).join(',')})`)
    return parsed.data.result
  }, Date.now)
  writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2))
  console.log(JSON.stringify({ checkpointPath, stage: checkpoint.stage, earliestReplacementAt: checkpoint.earliestReplacementAt }))
}
