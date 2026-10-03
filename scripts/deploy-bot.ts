import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

const pointerSchema = z.object({ configPath: z.string().nonempty() })
const configSchema = z.object({
  name: z.string().nonempty(),
  configPath: z.string().nonempty(),
  triggers: z.object({ crons: z.array(z.string().nonempty()).length(0) })
})

export const getBotDeploymentConfigPath = (root: string, environment: string): string => {
  if (!['staging', 'production'].includes(environment)) throw new Error('Select staging or production explicitly')
  const pointer = resolve(root, 'workers/bot/.wrangler/deploy/config.json')
  if (!existsSync(pointer)) throw new Error('Build the bot before deploying: bun run build:bot')
  const parsed = pointerSchema.safeParse(JSON.parse(readFileSync(pointer, 'utf8')))
  if (!parsed.success) throw new Error('Invalid bot deployment pointer')
  const output = resolve(dirname(pointer), parsed.data.configPath)
  if (!existsSync(output)) throw new Error('Bot deployment output is missing; rebuild the bot')
  const config = configSchema.safeParse(JSON.parse(readFileSync(output, 'utf8')))
  if (!config.success) throw new Error('Invalid or active bot deployment output; rebuild the skeleton')
  if (config.data.configPath !== resolve(root, 'workers/bot/wrangler.toml')) throw new Error('Unexpected bot config path')
  if (config.data.name !== `biccame-musume-bot-skeleton-${environment}`) throw new Error('Bot build environment mismatch')
  return output
}

if (import.meta.main) {
  const environment = process.argv.slice(2).find((arg) => arg.startsWith('--env='))?.slice(6)
  if (!environment) throw new Error('Select --env=staging or --env=production explicitly')
  const root = resolve(import.meta.dir, '..')
  const child = Bun.spawn(['bunx', 'wrangler', 'deploy', '--config', getBotDeploymentConfigPath(root, environment)], {
    cwd: root,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit'
  })
  process.exit(await child.exited)
}
