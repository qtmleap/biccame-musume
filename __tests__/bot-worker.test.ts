import { describe, expect, spyOn, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { botPingResponseSchema } from '@biccame/shared/bot'
import { z } from 'zod'
import { getBotDeploymentConfigPath } from '../scripts/deploy-bot'
import { classifyBotCron, handleBotScheduled } from '../workers/bot/src/scheduled'
import { pingBot } from '../workers/bot/src/service'

const root = resolve(import.meta.dir, '..')

test('ping preserves correlation and advertises disabled notifications', () => {
  expect(pingBot({ requestId: 'test' })).toEqual({
    requestId: 'test',
    service: 'bot',
    phase: 'posting',
    notificationsEnabled: false
  })
  expect(botPingResponseSchema.safeParse({ ...pingBot({ requestId: 'test' }), service: 'invalid' }).success).toBe(false)
})

test.each([{}, { requestId: '' }, { requestId: 'a'.repeat(129) }, { requestId: 'test', extra: true }, null])(
  'ping rejects invalid input without exposing it: %j',
  (input) => {
    expect(() => pingBot(input)).toThrow('Invalid bot ping request')
  }
)

test('scheduled dispatch distinguishes overlapping midnight crons without executing either', () => {
  expect(classifyBotCron('*/5 0-12 * * *')).toBe('timeline')
  expect(classifyBotCron('0 0 * * *')).toBe('daily')
  expect(classifyBotCron('0 0 * * * ')).toBe('unknown')
  const info = spyOn(console, 'info').mockImplementation(() => {})
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    handleBotScheduled({ cron: '*/5 0-12 * * *' })
    handleBotScheduled({ cron: '0 0 * * *' })
    handleBotScheduled({ cron: 'unexpected-sensitive-input' })
    expect(info.mock.calls).toEqual([['bot scheduled: timeline disabled'], ['bot scheduled: daily disabled']])
    expect(warn.mock.calls).toEqual([['bot scheduled: unknown cron']])
  } finally {
    info.mockRestore()
    warn.mockRestore()
  }
})

test('only production enables cron while local/staging stay disabled and bot has no DB', () => {
  const environment = z.object({
    name: z.string().nonempty(),
    vars: z.strictObject({
      OPENAI_BASE_URL: z.literal('https://ai.qleap.jp/v1'),
      OPENAI_MODEL: z.literal('codex,gpt-5.6-luna'),
      TL_NOTIFICATIONS_ENABLED: z.enum(['true', 'false']),
      X_POSTING_ENABLED: z.enum(['true', 'false']),
      X_ACCOUNT_READ_ENABLED: z.enum(['true', 'false'])
    }),
    triggers: z.object({ crons: z.array(z.string().nonempty()) })
  })
  const parsed = environment
    .extend({
      workers_dev: z.literal(false),
      preview_urls: z.literal(false),
      env: z.record(
        z.string().nonempty(),
        environment.extend({
          observability: z.object({ enabled: z.literal(true), head_sampling_rate: z.literal(1) })
        })
      )
    })
    .safeParse(Bun.TOML.parse(readFileSync(resolve(root, 'workers/bot/wrangler.toml'), 'utf8')))
  if (!parsed.success) throw new Error(parsed.error.message)
  expect(Object.keys(parsed.data.env).sort()).toEqual(['production', 'staging'])
  const raw = Bun.TOML.parse(readFileSync(resolve(root, 'workers/bot/wrangler.toml'), 'utf8'))
  expect(raw).not.toHaveProperty('d1_databases')
  expect(Object.keys(parsed.data.vars)).toEqual([
    'OPENAI_BASE_URL',
    'OPENAI_MODEL',
    'TL_NOTIFICATIONS_ENABLED',
    'X_POSTING_ENABLED',
    'X_ACCOUNT_READ_ENABLED'
  ])
  expect(parsed.data.vars.TL_NOTIFICATIONS_ENABLED).toBe('false')
  expect(parsed.data.triggers.crons).toEqual([])
  expect(parsed.data.env.staging.triggers.crons).toEqual([])
  expect(parsed.data.env.staging.vars.TL_NOTIFICATIONS_ENABLED).toBe('false')
  expect(parsed.data.env.staging.vars.X_POSTING_ENABLED).toBe('false')
  expect(parsed.data.env.production.triggers.crons).toEqual(['*/5 0-12 * * *', '0 0 * * *'])
  expect(parsed.data.env.production.vars.TL_NOTIFICATIONS_ENABLED).toBe('true')
  expect(parsed.data.env.production.vars.X_POSTING_ENABLED).toBe('true')
  expect(parsed.data.env.production.vars.X_ACCOUNT_READ_ENABLED).toBe('true')
})

describe('bot deployment output validation', () => {
  test('refuses missing builds and implicit environments', () => {
    const temporary = mkdtempSync(resolve(tmpdir(), 'bot-unbuilt-'))
    try {
      expect(() => getBotDeploymentConfigPath(temporary, '')).toThrow('explicitly')
      expect(() => getBotDeploymentConfigPath(temporary, 'staging')).toThrow('Build the bot')
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
  })
  test('selects canonical generated output and rejects an environment mismatch or active cron', () => {
    const temporary = mkdtempSync(resolve(tmpdir(), 'bot-built-'))
    const directory = resolve(temporary, 'workers/bot/.wrangler/deploy')
    const output = resolve(temporary, 'workers/bot/dist/bot/wrangler.json')
    const config = {
      name: 'musume-workers-staging',
      vars: { TL_NOTIFICATIONS_ENABLED: 'false' },
      configPath: resolve(temporary, 'workers/bot/wrangler.toml'),
      triggers: { crons: [] }
    }
    try {
      mkdirSync(directory, { recursive: true })
      mkdirSync(resolve(temporary, 'workers/bot/dist/bot'), { recursive: true })
      writeFileSync(resolve(directory, 'config.json'), JSON.stringify({ configPath: '../../dist/bot/wrangler.json' }))
      writeFileSync(output, JSON.stringify(config))
      expect(getBotDeploymentConfigPath(temporary, 'staging')).toBe(output)
      expect(() => getBotDeploymentConfigPath(temporary, 'production')).toThrow('environment mismatch')
      writeFileSync(output, JSON.stringify({ ...config, triggers: { crons: ['0 0 * * *'] } }))
      expect(() => getBotDeploymentConfigPath(temporary, 'staging')).toThrow('active bot deployment')
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
  })
})
