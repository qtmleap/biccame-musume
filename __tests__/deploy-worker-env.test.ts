import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { assertAppBuildEnvironment } from '../scripts/deploy-app'
import { assertNoEnvironmentArgument, wranglerDeployEnvironment } from '../scripts/deploy-worker-env'

test('generated Worker deploys never receive the build environment twice', () => {
  const environment = wranglerDeployEnvironment({
    CLOUDFLARE_ENV: 'staging',
    CLOUDFLARE_API_TOKEN: 'synthetic',
    UNSET: undefined
  })
  expect(environment).toEqual({ CLOUDFLARE_API_TOKEN: 'synthetic' })
  expect(() => assertNoEnvironmentArgument(['--env=production'])).toThrow('Do not pass --env')
  expect(() => assertNoEnvironmentArgument(['--env', 'staging'])).toThrow('Do not pass --env')
  expect(() => assertNoEnvironmentArgument(['-e', 'staging'])).toThrow('Do not pass --env')
  expect(() => assertNoEnvironmentArgument(['--dry-run'])).not.toThrow()
})

test('app deploy refuses a build whose resolved Worker name belongs to another environment', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'app-env-'))
  const config = resolve(directory, 'wrangler.json')
  try {
    writeFileSync(config, JSON.stringify({ name: 'biccame-musume-dev' }))
    expect(() => assertAppBuildEnvironment(config, 'staging')).not.toThrow()
    expect(() => assertAppBuildEnvironment(config, 'production')).toThrow('environment mismatch')
    expect(() => assertAppBuildEnvironment(config, undefined)).toThrow('explicitly')
    writeFileSync(config, JSON.stringify({ name: 'biccame-musume-dev-staging' }))
    expect(() => assertAppBuildEnvironment(config, 'staging')).toThrow('environment mismatch')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
