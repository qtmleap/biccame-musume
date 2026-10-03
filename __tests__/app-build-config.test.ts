import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { getAppDeploymentConfigPath } from '../scripts/deploy-app'

const root = resolve(import.meta.dir, '..')
const app = resolve(root, 'workers/app')
const database = z.object({
  binding: z.string().nonempty(),
  database_id: z.string().nonempty(),
  database_name: z.string().nonempty(),
  migrations_dir: z.string().nonempty(),
  migrations_pattern: z.string().nonempty()
})
const worker = z.object({
  name: z.string().nonempty(),
  d1_databases: z.array(database),
  kv_namespaces: z.array(z.object({ binding: z.string().nonempty(), id: z.string().nonempty() })),
  durable_objects: z.object({
    bindings: z.array(z.object({ name: z.string().nonempty(), class_name: z.string().nonempty() }))
  }),
  ai: z.object({ binding: z.string().nonempty() }),
  assets: z.object({ binding: z.string().nonempty(), directory: z.string().nonempty().optional() }),
  ratelimits: z.array(
    z.object({
      name: z.string().nonempty(),
      namespace_id: z.string().nonempty(),
      simple: z.object({ limit: z.number(), period: z.number() })
    })
  ),
  migrations: z.array(z.object({ tag: z.string().nonempty() })),
  triggers: z.object({ crons: z.array(z.string().nonempty()).default([]) }).default({ crons: [] })
})
const sourceSchema = worker.extend({ env: z.record(z.string().nonempty(), worker) })
const outputSchema = worker.extend({
  configPath: z.string().nonempty(),
  userConfigPath: z.string().nonempty(),
  // Phase 1の未デプロイbotに既存appのデプロイを依存させない。
  services: z.array(z.unknown()).length(0)
})

// Fresh checkout の単体テストでは build を要求しない。CI と明示的な build 検証でのみ実行する。
test.skipIf(process.env.BICCAME_VERIFY_BUILD !== '1')(
  'generated deployment keeps canonical paths, bindings and selected cron',
  () => {
    const source = sourceSchema.safeParse(Bun.TOML.parse(readFileSync(resolve(app, 'wrangler.toml'), 'utf8')))
    if (!source.success) throw new Error(source.error.message)
    const outputPath = getAppDeploymentConfigPath(root)
    const output = outputSchema.safeParse(JSON.parse(readFileSync(outputPath, 'utf8')))
    if (!output.success) throw new Error(output.error.message)
    const environment = process.env.CLOUDFLARE_ENV
    const expected = environment ? source.data.env[environment] : source.data
    if (!expected) throw new Error('Unknown Worker environment')
    expect(output.data.configPath).toBe(resolve(app, 'wrangler.toml'))
    expect(output.data.userConfigPath).toBe(resolve(app, 'wrangler.toml'))
    expect(output.data.name).toBe(expected.name)
    expect(output.data.kv_namespaces).toEqual(expected.kv_namespaces)
    expect(output.data.durable_objects).toEqual(expected.durable_objects)
    expect(output.data.triggers.crons).toEqual(expected.triggers.crons)
    expect(output.data.ai).toEqual(expected.ai)
    expect(output.data.ratelimits).toEqual(expected.ratelimits)
    expect(output.data.migrations).toEqual(expected.migrations)
    expect(output.data.assets.binding).toBe(expected.assets.binding)
    const assets = output.data.assets.directory
    if (!assets) throw new Error('Missing generated assets directory')
    expect(resolve(dirname(outputPath), assets)).toBe(resolve(app, 'dist/client'))
    expect(existsSync(resolve(dirname(outputPath), assets))).toBe(true)
    expect(
      output.data.d1_databases.map(({ binding, database_id, database_name }) => ({
        binding,
        database_id,
        database_name
      }))
    ).toEqual(
      expected.d1_databases.map(({ binding, database_id, database_name }) => ({ binding, database_id, database_name }))
    )
    for (const entry of output.data.d1_databases) {
      const migrations = resolve(dirname(outputPath), entry.migrations_dir)
      expect(migrations).toBe(resolve(root, 'prisma/migrations'))
      expect(existsSync(migrations)).toBe(true)
      expect(resolve(dirname(outputPath), entry.migrations_pattern)).toBe(
        resolve(root, 'prisma/migrations/*/migration.sql')
      )
    }
  }
)
