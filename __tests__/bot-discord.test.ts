import { expect, mock, spyOn, test } from 'bun:test'
import { discordDeliveryResultSchema, discordStatusSchema, type EventDetectionNotification } from '@biccame/shared/bot'
import {
  buildDetectionNotification,
  checkDiscordConnection,
  discordStatus,
  notifyEventDetection,
  postDiscordMessage,
  testDiscordNotification
} from '../workers/bot/src/discord'

const env = {
  DISCORD_TOKEN: 'synthetic-discord-token',
  DISCORD_CHANNEL_ID: '12345',
  X_POSTING_ENABLED: 'false',
  TL_NOTIFICATIONS_ENABLED: 'false'
}
const notification: EventDetectionNotification = {
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  postId: '2109221721773576390',
  status: 'held',
  postUrl: 'https://x.com/example/status/2109221721773576390',
  managementUrl: 'https://example.invalid/admin/webhook-events',
  text: '@everyone 配布についてのテスト投稿',
  confidence: 0.92,
  reasons: ['開始日が不明'],
  stores: ['架空の店舗']
}

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const accepted = mock(async () => reply({ id: '987654321' }))

test('event notifications send without a notification flag independently of disabled X and TL flags', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const result = await notifyEventDetection(env, notification, async (url, init) => {
    calls.push({ url, init })
    return reply({ id: '987654321' })
  })
  expect(result).toEqual({ status: 'sent', messageId: '987654321' })
  expect(discordDeliveryResultSchema.safeParse(result).success).toBe(true)
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toBe('https://discord.com/api/v10/channels/12345/messages')
  expect(calls[0].init.headers).toEqual({
    'Content-Type': 'application/json',
    Authorization: 'Bot synthetic-discord-token'
  })
  const payload = JSON.parse(String(calls[0].init.body))
  expect(payload.allowed_mentions).toEqual({ parse: [] })
  expect(payload.enforce_nonce).toBe(true)
  expect(payload.nonce).toHaveLength(25)
  expect(JSON.stringify(payload)).not.toContain(env.DISCORD_TOKEN)
})

test('missing notification credentials fail configuration without sending', async () => {
  const send = mock(async () => reply({ id: '1' }))
  expect(await notifyEventDetection({}, notification, send)).toEqual({ status: 'failed', kind: 'configuration' })
  expect(send).not.toHaveBeenCalled()
  expect(await notifyEventDetection({ ...env, DISCORD_TOKEN: '' }, notification, send)).toEqual({
    status: 'failed',
    kind: 'configuration'
  })
  expect(send).not.toHaveBeenCalled()
})

test('invalid notification input does not send', async () => {
  const send = mock(async () => reply({ id: '1' }))
  expect(await notifyEventDetection(env, { ...notification, confidence: 2 }, send)).toEqual({
    status: 'failed',
    kind: 'invalid_input'
  })
  expect(send).not.toHaveBeenCalled()
})

test('rate limits expose safe retry_after without retries in the bot transport', async () => {
  const send = mock(async () => reply({ retry_after: 1.75, message: env.DISCORD_TOKEN }, 429))
  const result = await notifyEventDetection(env, notification, send)
  expect(result).toEqual({ status: 'failed', kind: 'rate_limit', statusCode: 429, retryAfterSeconds: 1.75 })
  expect(JSON.stringify(result)).not.toContain(env.DISCORD_TOKEN)
  expect(send).toHaveBeenCalledTimes(1)
})

test('Discord rejections distinguish authentication and channel authorization', async () => {
  expect(await notifyEventDetection(env, notification, async () => reply({}, 401))).toEqual({
    status: 'failed',
    kind: 'authentication',
    statusCode: 401
  })
  expect(await notifyEventDetection(env, notification, async () => reply({}, 403))).toEqual({
    status: 'failed',
    kind: 'authorization',
    statusCode: 403
  })
})

test('network, upstream and malformed success outcomes are unknown and not resent', async () => {
  const send = mock(async () => {
    throw new Error(env.DISCORD_TOKEN)
  })
  expect(await notifyEventDetection(env, notification, send)).toEqual({ status: 'unknown', kind: 'delivery_unknown' })
  expect(send).toHaveBeenCalledTimes(1)
  expect(await notifyEventDetection(env, notification, async () => reply({}, 503))).toEqual({
    status: 'unknown',
    kind: 'delivery_unknown'
  })
  expect(await notifyEventDetection(env, notification, async () => reply({}))).toEqual({
    status: 'unknown',
    kind: 'delivery_unknown'
  })
})

test('registered notifications include event content and distinct short nonces', async () => {
  const input: EventDetectionNotification = {
    ...notification,
    status: 'registered',
    event: {
      title: '架空店舗の名刺配布',
      url: 'https://example.invalid/events/550e8400-e29b-41d4-a716-446655440000',
      category: 'limited_card',
      startDate: '2026-10-11',
      conditions: ['先着順']
    }
  }
  const calls: string[] = []
  const send = async (_url: string, init: RequestInit) => {
    calls.push(String(init.body))
    return reply({ id: '1' })
  }
  await notifyEventDetection(env, notification, send)
  await notifyEventDetection(env, input, send)
  expect(JSON.parse(calls[0]).nonce).not.toBe(JSON.parse(calls[1]).nonce)
  expect(calls[1]).toContain('先着順')
  expect(calls[1]).toContain('終了日未定')
})

test('maximum notification values stay within Discord embed limits', () => {
  const payload = buildDetectionNotification({
    ...notification,
    status: 'registered',
    text: '文'.repeat(20000),
    stores: Array.from({ length: 20 }, () => '店'.repeat(200)),
    event: {
      title: '名'.repeat(300),
      url: `https://example.invalid/${'a'.repeat(1900)}`,
      category: 'c'.repeat(50),
      startDate: 's'.repeat(100),
      endDate: 'e'.repeat(100),
      conditions: Array.from({ length: 20 }, () => '条'.repeat(300))
    }
  })
  const embed = payload.embeds[0]
  const count =
    embed.title.length +
    embed.description.length +
    embed.footer.text.length +
    embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0)
  expect(count).toBeLessThanOrEqual(6000)
  expect(embed.title.length).toBeLessThanOrEqual(256)
  for (const field of embed.fields) expect(field.value.length).toBeLessThanOrEqual(1024)
})

test('explicit test sends independently of disabled X and TL flags', async () => {
  const result = await testDiscordNotification(
    env,
    {
      requestId: notification.requestId
    },
    accepted
  )
  expect(result).toEqual({ status: 'sent', messageId: '987654321' })
  expect(await testDiscordNotification(env, { requestId: 'invalid' }, accepted)).toEqual({
    status: 'failed',
    kind: 'invalid_input'
  })
})

test('unconfigured status performs no requests and contains no secret values', async () => {
  const read = mock(async () => reply({}))
  const result = await checkDiscordConnection({ DISCORD_TOKEN: env.DISCORD_TOKEN }, read)
  expect(result.notificationsEnabled).toBe(true)
  expect(result.connection).toBe('unconfigured')
  expect(result.configured).toEqual({ token: true, channel: false })
  expect(JSON.stringify(result)).not.toContain(env.DISCORD_TOKEN)
  expect(discordStatusSchema.safeParse(result).success).toBe(true)
  expect(read).not.toHaveBeenCalled()
})

test('status reads identity and channel but does not claim that sending is permitted', async () => {
  const paths: string[] = []
  const result = await checkDiscordConnection(env, async (url, init) => {
    paths.push(url)
    expect(init.method).toBe('GET')
    return url.endsWith('/users/@me')
      ? reply({ id: '67890', username: 'synthetic-bot', token: env.DISCORD_TOKEN })
      : reply({ id: env.DISCORD_CHANNEL_ID, name: 'synthetic-channel', secret: env.DISCORD_TOKEN })
  })
  expect(result.notificationsEnabled).toBe(true)
  expect(result.xPostingEnabled).toBe(false)
  expect(result.timelineNotificationsEnabled).toBe(false)
  expect(result.connection).toBe('connected')
  expect(result.bot).toEqual({ id: '67890', username: 'synthetic-bot' })
  expect(result.channel).toEqual({ id: '12345', name: 'synthetic-channel' })
  expect(result.sendPermission).toBe('unknown')
  expect(paths).toHaveLength(2)
  expect(JSON.stringify(result)).not.toContain(env.DISCORD_TOKEN)
  expect(discordStatusSchema.safeParse(result).success).toBe(true)
})

test('status classifies invalid auth, forbidden channel, malformed and network responses', async () => {
  expect((await checkDiscordConnection(env, async () => reply({}, 401))).connection).toBe('authentication')
  const forbidden = await checkDiscordConnection(env, async (url) =>
    url.endsWith('/users/@me') ? reply({ id: '1', username: 'bot' }) : reply({}, 403)
  )
  expect(forbidden.connection).toBe('authorization')
  expect(forbidden.bot?.id).toBe('1')
  expect((await checkDiscordConnection(env, async () => reply({}))).connection).toBe('unexpected_response')
  expect(
    (
      await checkDiscordConnection(env, async () => {
        throw new Error('synthetic')
      })
    ).connection
  ).toBe('network')
})

test('existing timeline transport shares mention suppression without requiring a nonce', async () => {
  const calls: string[] = []
  await postDiscordMessage(env, { content: '@everyone' }, async (_url, init) => {
    calls.push(String(init.body))
    return reply({ id: '1' })
  })
  expect(JSON.parse(calls[0])).toEqual({ content: '@everyone', allowed_mentions: { parse: [] } })
})

test('page-load passive status makes zero transport calls with configured credentials', async () => {
  const fetchStub = Object.assign(async () => reply({}), { preconnect: () => undefined })
  const transport = spyOn(globalThis, 'fetch').mockImplementation(fetchStub)
  try {
    expect((await discordStatus(env)).connection).toBe('unchecked')
    expect(transport).not.toHaveBeenCalled()
  } finally {
    transport.mockRestore()
  }
})

test('passive status validates Worker settings without any external request', async () => {
  const valid = await discordStatus(env)
  expect(valid.connection).toBe('unchecked')
  expect(valid.settings).toEqual({ token: 'valid', channel: 'valid' })
  expect(valid.configured).toEqual({ token: true, channel: true })
  expect(valid.bot).toBeNull()
  expect(valid.channel).toBeNull()
  expect(valid.errorKind).toBeNull()
  expect(JSON.stringify(valid)).not.toContain(env.DISCORD_TOKEN)
  expect((await discordStatus({})).settings).toEqual({ token: 'missing', channel: 'missing' })
  const invalid = await discordStatus({ DISCORD_TOKEN: '   ', DISCORD_CHANNEL_ID: 'not-a-number' })
  expect(invalid.settings).toEqual({ token: 'invalid', channel: 'invalid' })
  expect(invalid.configured).toEqual({ token: false, channel: false })
  expect(invalid.configFingerprint).toBeNull()
})

test('configuration fingerprint binds validated token and channel without exposing credentials', async () => {
  const initial = await discordStatus(env)
  expect(initial.configFingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect((await discordStatus(env)).configFingerprint).toBe(initial.configFingerprint)
  expect((await discordStatus({ ...env, DISCORD_TOKEN: 'synthetic-replacement' })).configFingerprint).not.toBe(
    initial.configFingerprint
  )
  expect((await discordStatus({ ...env, DISCORD_CHANNEL_ID: '54321' })).configFingerprint).not.toBe(
    initial.configFingerprint
  )
  expect((await discordStatus({ ...env, DISCORD_TOKEN: ` ${env.DISCORD_TOKEN} ` })).configFingerprint).toBe(
    initial.configFingerprint
  )
  expect((await discordStatus({})).configFingerprint).toBeNull()
  expect(JSON.stringify(initial)).not.toContain(env.DISCORD_TOKEN)
})
