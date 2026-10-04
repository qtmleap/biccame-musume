import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

const deploymentSchema = z.object({ configPath: z.string().nonempty() })

export const getAppDeploymentConfigPath = (root: string): string => {
  const pointer = resolve(root, 'workers/app/.wrangler/deploy/config.json')
  if (!existsSync(pointer)) throw new Error('Build the app before deploying: bun run build')
  const parsed = deploymentSchema.safeParse(JSON.parse(readFileSync(pointer, 'utf8')))
  if (!parsed.success) throw new Error('Invalid app deployment pointer; rebuild the app before deploying')
  const configPath = resolve(dirname(pointer), parsed.data.configPath)
  if (!existsSync(configPath)) throw new Error('App deployment output is missing; rebuild the app before deploying')
  return configPath
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..')
  const child = Bun.spawn(['bunx', 'wrangler', 'deploy', '--config', getAppDeploymentConfigPath(root), ...process.argv.slice(2)], {
    cwd: root,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit'
  })
  process.exit(await child.exited)
}
