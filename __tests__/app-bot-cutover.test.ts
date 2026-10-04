import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const root = resolve(import.meta.dirname, '..')
const source = (file: string) => readFileSync(resolve(root, 'workers/app', file), 'utf8')

test('app cannot post directly or retain posting credentials after cutover', () => {
  for (const file of [
    'src/utils/twitter.ts',
    'src/utils/twitter-health.ts',
    'src/utils/discord.ts',
    'src/services/daily-cron.ts',
    'src/lib/x-transaction/index.ts'
  ]) {
    expect(existsSync(resolve(root, 'workers/app', file))).toBe(false)
  }
  expect(source('src/types/bindings.ts')).not.toContain('TWITTER_AUTH_TOKEN')
  expect(source('src/types/bindings.ts')).not.toContain('TWITTER_CSRF_TOKEN')
  expect(source('src/services/bot-announcement.ts')).not.toContain('new Twitter')
  expect(source('src/index.ts')).toContain('runBadgeCron(env, scheduledAt)')
  expect(source('src/index.ts')).not.toContain('runDailyCron')
})

test('all app environments bind only the matching bot named entrypoint', () => {
  const service = z.object({
    binding: z.literal('BOT'),
    service: z.string().nonempty(),
    entrypoint: z.literal('BotService')
  })
  const parsed = z
    .object({
      services: z.array(service).length(1),
      env: z.object({
        staging: z.object({ services: z.array(service).length(1) }),
        production: z.object({ services: z.array(service).length(1) })
      })
    })
    .safeParse(Bun.TOML.parse(source('wrangler.toml')))
  if (!parsed.success) throw new Error('Invalid app bot binding configuration')
  expect(parsed.data.services[0].service).toBe('musume-workers')
  expect(parsed.data.env.staging.services[0].service).toBe('musume-workers-staging')
  expect(parsed.data.env.production.services[0].service).toBe('musume-workers')
})
