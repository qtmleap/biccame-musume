import { expect, test } from 'bun:test'
import adminRoutes from '@api/routes/admin/index'
import botRoutes from '@api/routes/admin-bot'
import { discordStatusSchema } from '@biccame/shared/bot'
import dayjs from 'dayjs'

const status = () => {
  const parsed = discordStatusSchema.safeParse({
    configFingerprint: 'a'.repeat(64),
    configured: { token: true, channel: true },
    settings: { token: 'valid', channel: 'valid' },
    notificationsEnabled: true,
    xPostingEnabled: false,
    timelineNotificationsEnabled: false,
    connection: 'unchecked',
    bot: null,
    channel: null,
    sendPermission: 'unknown',
    errorKind: null,
    fetchedAt: dayjs().toISOString()
  })
  if (!parsed.success) throw new Error('Invalid test Discord status')
  return parsed.data
}
test('Bot status discloses configuration presence, not secret values, and never sends a message', async () => {
  const sent: string[] = []
  const env = {
    BICCAME_MUSUME_EVENTS: { get: async () => null },
    WEBHOOK_SECRET_KEY: 'synthetic-current-secret',
    BOT: {
      discordStatus: async () => status(),
      checkDiscordConnection: async () => {
        sent.push('connection')
        return { ...status(), connection: 'connected' }
      },
      testDiscordNotification: async () => {
        sent.push('test')
        return { status: 'sent', messageId: '123456' }
      }
    }
  }
  const response = await botRoutes.request('/admin/bot/status', {}, env)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  const body = await response.text()
  expect(body).not.toContain('synthetic-current-secret')
  expect(body).toContain('"botConnected":true')
  expect(body).toContain('"sendPermission":"unknown"')
  expect(body).toContain('"connection":"unchecked"')
  expect(sent).toHaveLength(0)
  const connectionResponse = await botRoutes.request('/admin/bot/connection', { method: 'POST' }, env)
  expect(connectionResponse.status).toBe(200)
  expect(await connectionResponse.json()).toMatchObject({ discord: { connection: 'connected' } })
  expect(sent).toEqual(['connection'])
  const testResponse = await botRoutes.request(
    '/admin/bot/test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: '550e8400-e29b-41d4-a716-446655440000' })
    },
    env
  )
  expect(testResponse.status).toBe(200)
  expect(sent).toEqual(['connection', 'test'])
})
test('Bot RPC response failures do not expose upstream exception details', async () => {
  const response = await botRoutes.request(
    '/admin/bot/status',
    {},
    {
      BICCAME_MUSUME_EVENTS: { get: async () => null },
      BOT: {
        discordStatus: async () => {
          throw new Error('synthetic-private-upstream-detail')
        }
      }
    }
  )
  expect(response.status).toBe(200)
  const body = await response.text()
  expect(body).toContain('"botConnected":false')
  expect(body).not.toContain('synthetic-private-upstream-detail')
})
test('Bot and webhook job management remain protected by Cloudflare Access', async () => {
  for (const path of ['/admin/bot/status', '/admin/webhook/jobs']) {
    const response = await adminRoutes.request(path, {}, { ENVIRONMENT: 'prod' })
    expect(response.status).toBe(401)
  }
})

test('explicit Discord connection check remains protected by Cloudflare Access', async () => {
  const response = await adminRoutes.request('/admin/bot/connection', { method: 'POST' }, { ENVIRONMENT: 'prod' })
  expect(response.status).toBe(401)
})
