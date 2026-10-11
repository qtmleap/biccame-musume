import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const root = resolve(import.meta.dirname, '..')
const worker = z.object({
  name: z.string().nonempty(),
  services: z.array(
    z.object({ binding: z.string().nonempty(), service: z.string().nonempty(), entrypoint: z.string().nonempty() })
  )
})
const configuration = worker.extend({ env: z.record(z.string().nonempty(), worker) })
const parse = (workspace: string) => {
  const parsed = configuration.safeParse(
    Bun.TOML.parse(readFileSync(resolve(root, `workers/${workspace}/wrangler.toml`), 'utf8'))
  )
  if (!parsed.success) throw new Error('Invalid Worker source configuration')
  return parsed.data
}

test.each([undefined, 'staging', 'production'])('canonical RPC targets match Worker names in %s', (environment) => {
  const app = parse('web')
  const bot = parse('bot')
  const appConfig = environment ? app.env[environment] : app
  const botConfig = environment ? bot.env[environment] : bot
  if (!appConfig || !botConfig) throw new Error('Unknown Worker environment')
  expect(appConfig.services).toEqual([{ binding: 'BOT', service: botConfig.name, entrypoint: 'BotService' }])
  expect(botConfig.services).toEqual([{ binding: 'APP', service: appConfig.name, entrypoint: 'AppBotReadService' }])
})

test('local auxiliary bot name and service override stay local', () => {
  const config = readFileSync(resolve(root, 'workers/web/vite.config.ts'), 'utf8')
  expect(config).toContain("config: command === 'serve' ? { name: 'musume-workers' } : undefined")
  expect(config).toContain("{ binding: 'BOT', service: 'musume-workers', entrypoint: 'BotService' }")
})
