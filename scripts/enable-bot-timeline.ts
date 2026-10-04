import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { assertReplacementReady, timelineCron } from './bot-cutover-state'

// 旧cron停止と待機を確認済みの、Phase 2隔離候補だけをTL通知有効で同名Workerへデプロイする。
export const approvedPhase2Sha = 'c5b3e9020a9985d91dadea5f3c44ec01bf706d1e'
const manifestSchema = z.object({
  sourceSha: z.literal(approvedPhase2Sha), configPath: z.string().nonempty(),
  bundleSha256: z.string().regex(/^[a-f0-9]{64}$/)
})
const configSchema = z.object({
  name: z.literal('musume-workers'), main: z.string().nonempty(),
  triggers: z.object({ crons: z.array(z.string()).length(0) }),
  vars: z.object({ TL_NOTIFICATIONS_ENABLED: z.literal('false') }),
  services: z.array(z.unknown()).length(0)
})

export const planTimelineEnable = (
  checkpoint: unknown, manifest: unknown, readText: (path: string) => string, readBytes: (path: string) => Uint8Array, now: number
) => {
  assertReplacementReady(checkpoint, now)
  const parsedManifest = manifestSchema.safeParse(manifest)
  if (!parsedManifest.success) throw new Error('Only the approved isolated phase 2 candidate can be enabled')
  const config = configSchema.safeParse(JSON.parse(readText(parsedManifest.data.configPath)))
  if (!config.success) throw new Error('Phase 2 candidate configuration is not the disabled production build')
  const bundle = readBytes(resolve(dirname(parsedManifest.data.configPath), config.data.main))
  if (new Bun.CryptoHasher('sha256').update(bundle).digest('hex') !== parsedManifest.data.bundleSha256) {
    throw new Error('Phase 2 candidate bundle changed after verification')
  }
  return {
    configPath: parsedManifest.data.configPath,
    args: ['wrangler', 'deploy', '--config', parsedManifest.data.configPath, '--var', 'TL_NOTIFICATIONS_ENABLED:true', '--triggers', timelineCron]
  }
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..')
  const checkpointPath = resolve(root, `.cache/bot-replacement-checkpoint-${approvedPhase2Sha}.json`)
  const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'))
  const manifestPath = resolve(root, `.cache/bot-phase2-deployment-${approvedPhase2Sha}.json`)
  const plan = planTimelineEnable(
    checkpoint, JSON.parse(readFileSync(manifestPath, 'utf8')),
    (path) => readFileSync(path, 'utf8'), (path) => readFileSync(path), Date.now()
  )
  const dryRun = process.argv.includes('--dry-run')
  const enabledPath = resolve(root, `.cache/bot-timeline-enabled-${approvedPhase2Sha}.json`)
  if (!dryRun && existsSync(enabledPath)) throw new Error('Timeline enablement already recorded; do not deploy twice')
  if (!dryRun) writeFileSync(enabledPath, JSON.stringify({ stage: 'enable_requested', requestedAt: new Date().toISOString() }), { flag: 'wx' })
  const child = Bun.spawn(['bunx', ...plan.args, ...(dryRun ? ['--dry-run'] : [])], {
    cwd: root, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit'
  })
  const code = await child.exited
  if (code !== 0) process.exit(code)
  if (!dryRun) {
    writeFileSync(enabledPath, JSON.stringify({ stage: 'enabled', enabledAt: new Date().toISOString(), sourceSha: approvedPhase2Sha }, null, 2))
    console.log(JSON.stringify({ enabledPath, sourceSha: approvedPhase2Sha }))
  }
}
