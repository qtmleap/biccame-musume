import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { z } from 'zod'
import { getAppDeploymentConfigPath } from '../scripts/deploy-app'

const root = resolve(import.meta.dir, '..')
const app = resolve(root, 'workers/app')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const database = z.object({ migrations_dir: z.string().nonempty() })
const parsedConfig = z
  .object({
    main: z.string().nonempty(),
    d1_databases: z.array(database),
    env: z.record(z.string().nonempty(), z.object({ d1_databases: z.array(database) }))
  })
  .safeParse(Bun.TOML.parse(readFileSync(resolve(app, 'wrangler.toml'), 'utf8')))
if (!parsedConfig.success) throw new Error(parsedConfig.error.message)
const config = parsedConfig.data

test('the root workspace exposes app, bot and shared contracts', () => {
  expect(manifest.workspaces).toEqual(['workers/app', 'workers/bot', 'packages/shared'])
  const member = JSON.parse(readFileSync(resolve(app, 'package.json'), 'utf8'))
  expect(member.name).toBe('@biccame/app')
  expect(member.private).toBe(true)
  expect(existsSync(resolve(root, 'workers/bot/README.md'))).toBe(true)
  expect(existsSync(resolve(root, 'src'))).toBe(false)
})

test('the app HTML and Worker entrypoints resolve inside their workspace', () => {
  expect(config.main).toBe('src/index.ts')
  expect(existsSync(resolve(app, String(config.main)))).toBe(true)
  const html = readFileSync(resolve(app, 'index.html'), 'utf8')
  const entry = /<script[^>]+src="([^"]+)"/.exec(html)?.[1]
  if (!entry) throw new Error('Missing HTML entrypoint')
  expect(entry).toBe('/src/app/main.tsx')
  expect(existsSync(resolve(app, entry.slice(1)))).toBe(true)
  expect(existsSync(resolve(app, 'public/characters.json'))).toBe(true)
})

test('D1 migration directories resolve to the shared root schema in every environment', () => {
  const environments = config.env
  const databases = config.d1_databases
  for (const database of [...databases, ...Object.values(environments).flatMap((env) => env.d1_databases)]) {
    expect(resolve(app, database.migrations_dir)).toBe(resolve(root, 'prisma/migrations'))
    expect(existsSync(resolve(app, database.migrations_dir))).toBe(true)
  }
})

test('root migration commands preserve local state while selecting the canonical app config', () => {
  for (const script of ['migrate', 'migrate:status']) {
    expect(manifest.scripts[script]).toContain('--config workers/app/wrangler.toml')
    expect(manifest.scripts[script]).toContain('--persist-to .wrangler/state')
  }
  expect(manifest.scripts.generate).toContain('--config ./prisma/prisma.config.ts')
  const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8')
  const output = /output\s*=\s*"([^"]+)"/.exec(schema)?.[1]
  if (!output) throw new Error('Missing Prisma output')
  expect(resolve(root, 'prisma', output)).toBe(resolve(app, 'src/generated/prisma'))
})

test('deployment selects the app build rather than stale root output', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'biccame-deploy-layout-'))
  try {
    const pointerDirectory = resolve(temporary, 'workers/app/.wrangler/deploy')
    const outputDirectory = resolve(temporary, 'workers/app/dist/biccame_musume')
    mkdirSync(pointerDirectory, { recursive: true })
    mkdirSync(outputDirectory, { recursive: true })
    mkdirSync(resolve(temporary, '.wrangler/deploy'), { recursive: true })
    writeFileSync(
      resolve(temporary, '.wrangler/deploy/config.json'),
      JSON.stringify({ configPath: '../../stale.json' })
    )
    writeFileSync(
      resolve(pointerDirectory, 'config.json'),
      JSON.stringify({ configPath: '../../dist/biccame_musume/wrangler.json' })
    )
    writeFileSync(resolve(outputDirectory, 'wrangler.json'), '{}')
    expect(getAppDeploymentConfigPath(temporary)).toBe(resolve(outputDirectory, 'wrangler.json'))
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('deployment refuses to guess a config when no app build exists', () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'biccame-deploy-unbuilt-'))
  try {
    expect(() => getAppDeploymentConfigPath(temporary)).toThrow('Build the app before deploying')
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
