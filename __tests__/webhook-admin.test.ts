import { expect, spyOn, test } from 'bun:test'
import adminRoutes from '@api/routes/admin/index'
import botRoutes from '@api/routes/admin-bot'
import * as discord from '@api/services/discord'

const env = {
  BICCAME_MUSUME_EVENTS: { get: async () => null },
  WEBHOOK_SECRET_KEY: 'synthetic-current-secret',
  DISCORD_TOKEN: 'synthetic-discord-token',
  DISCORD_CHANNEL_ID: '12345'
}
test('web status reports local settings without external requests or secret disclosure', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch')
  try {
    const response = await botRoutes.request('/admin/bot/status', {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.text()
    expect(body).not.toContain(env.WEBHOOK_SECRET_KEY)
    expect(body).not.toContain(env.DISCORD_TOKEN)
    expect(body).toContain('"botConnected":true')
    expect(body).toContain('"connection":"unchecked"')
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})
test('web connection failures never expose raw upstream errors', async () => {
  const check = spyOn(discord, 'checkDiscordConnection').mockImplementation(async () => {
    throw new Error('synthetic-private-upstream-detail')
  })
  try {
    const response = await botRoutes.request('/admin/bot/connection', { method: 'POST' }, env)
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('synthetic-private-upstream-detail')
  } finally {
    check.mockRestore()
  }
})
test('posting and webhook management remain protected by Cloudflare Access', async () => {
  for (const path of ['/admin/bot/status', '/admin/webhook/jobs']) {
    const response = await adminRoutes.request(path, {}, { ENVIRONMENT: 'prod' })
    expect(response.status).toBe(401)
  }
  const connection = await adminRoutes.request('/admin/bot/connection', { method: 'POST' }, { ENVIRONMENT: 'prod' })
  expect(connection.status).toBe(401)
})
