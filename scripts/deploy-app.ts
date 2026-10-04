import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { assertNoEnvironmentArgument, wranglerDeployEnvironment } from './deploy-worker-env'
import { workerNames } from './worker-bindings'

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

export const assertAppBuildEnvironment = (configPath: string, environment: string | undefined): void => {
  if (!environment || !['staging', 'production'].includes(environment)) throw new Error('Select staging or production explicitly')
  const parsed = z.object({ name: z.string().nonempty() }).safeParse(JSON.parse(readFileSync(configPath, 'utf8')))
  if (!parsed.success || parsed.data.name !== workerNames(environment).app) throw new Error('App build environment mismatch')
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..')
  const args = process.argv.slice(2)
  assertNoEnvironmentArgument(args)
  const configPath = getAppDeploymentConfigPath(root)
  assertAppBuildEnvironment(configPath, process.env.CLOUDFLARE_ENV)
  const child = Bun.spawn(['bunx', 'wrangler', 'deploy', '--config', configPath, ...args], {
    cwd: root, env: wranglerDeployEnvironment(process.env), stdin: 'inherit', stdout: 'inherit', stderr: 'inherit'
  })
  process.exit(await child.exited)
}
