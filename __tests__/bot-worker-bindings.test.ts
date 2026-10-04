import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { appBotBinding, botAppBinding, workerNames } from '../scripts/worker-bindings'

const root = resolve(import.meta.dirname, '..')
const configuration = z.object({
  name: z.string().nonempty(),
  env: z.record(z.string().nonempty(), z.object({ name: z.string().nonempty() }))
})
const parse = (workspace: string) => {
  const parsed = configuration.safeParse(
    Bun.TOML.parse(readFileSync(resolve(root, `workers/${workspace}/wrangler.toml`), 'utf8'))
  )
  if (!parsed.success) throw new Error('Invalid Worker source configuration')
  return parsed.data
}

test.each([undefined, 'staging', 'production'])('RPC targets match canonical Worker names in %s', (environment) => {
  const app = parse('app')
  const bot = parse('bot')
  const names = workerNames(environment)
  expect(names.app).toBe(environment ? app.env[environment].name : app.name)
  expect(names.bot).toBe(environment ? bot.env[environment].name : bot.name)
  expect(appBotBinding(environment)).toEqual({ binding: 'BOT', service: names.bot, entrypoint: 'BotService' })
  expect(botAppBinding(environment)).toEqual({ binding: 'APP', service: names.app, entrypoint: 'AppBotReadService' })
})

test('local auxiliary bot name stays local while the main Worker follows the selected environment', () => {
  expect(appBotBinding('staging', true).service).toBe('musume-workers')
  expect(botAppBinding('staging').service).toBe('biccame-musume-dev')
  expect(() => workerNames('unknown')).toThrow('Unknown Worker environment')
})
