import { afterEach, expect, spyOn, test } from 'bun:test'
import { notifyBotHealthFailure } from '../../workers/bot/src/health-notification'
import { TwitterHealthError } from '@biccame/shared/x/health'

const webhook = 'https://discord.com/api/webhooks/123456/fixture-webhook-token'
const env = { DISCORD_WEBHOOK_URL: webhook } as never
const now = '2026-10-03T00:00:00Z'
const failure = new TwitterHealthError('authentication', 401)

afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore()
  spyOn(console, 'error').mockRestore()
  spyOn(console, 'log').mockRestore()
})

const intercept = (status = 204) => {
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  const logs = spyOn(console, 'log').mockImplementation(() => {})
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(async () => new Response(null, { status }), { preconnect: () => {} })
  )
  return { errors, logs, fetch }
}

test('sends only safe monitoring data and disables mentions', async () => {
  const { fetch, logs } = intercept()
  expect(await notifyBotHealthFailure(env, failure, now)).toBe('sent')
  const [url, init] = fetch.mock.calls[0]
  expect(String(url)).toBe(webhook)
  expect(init?.method).toBe('POST')
  expect(init?.redirect).toBe('manual')
  expect(init?.signal).toBeDefined()
  const body = JSON.parse(String(init?.body))
  expect(body.allowed_mentions).toEqual({ parse: [] })
  expect(body.content).toContain('authentication (HTTP 401)')
  expect(body.content).toContain(now)
  expect(body.content).not.toContain(webhook)
  expect(JSON.stringify(logs.mock.calls)).not.toContain('fixture-webhook-token')
})

test('reports an unconfigured notification channel without attempting delivery', async () => {
  const { fetch, errors } = intercept()
  expect(await notifyBotHealthFailure({} as never, failure, now)).toBe('unconfigured')
  expect(fetch).not.toHaveBeenCalled()
  expect(JSON.stringify(errors.mock.calls)).toContain('webhook unconfigured')
})

for (const url of [
  'https://example.com/api/webhooks/123/secret',
  'http://discord.com/api/webhooks/123/secret',
  'https://discord.com/not-a-webhook',
  'https://discord.com/api/webhooks/123/secret?extra=secret',
  'https://user:secret@discord.com/api/webhooks/123/secret',
  'not-a-url'
]) {
  test(`rejects invalid webhook configuration ${url.split('/')[2] ?? 'invalid'}`, async () => {
    const { fetch, errors } = intercept()
    expect(await notifyBotHealthFailure({ DISCORD_WEBHOOK_URL: url } as never, failure, now)).toBe('invalid_config')
    expect(fetch).not.toHaveBeenCalled()
    expect(JSON.stringify(errors.mock.calls)).not.toContain('secret')
  })
}

test('reports HTTP delivery failure without reading its body', async () => {
  const { fetch, errors } = intercept(429)
  fetch.mockImplementation(
    Object.assign(async () => new Response('sensitive upstream detail', { status: 429 }), { preconnect: () => {} })
  )
  expect(await notifyBotHealthFailure(env, failure, now)).toBe('failed')
  const logged = JSON.stringify(errors.mock.calls)
  expect(logged).toContain('429')
  expect(logged).not.toContain('sensitive upstream detail')
  expect(logged).not.toContain('fixture-webhook-token')
})

test('does not follow or treat a manual redirect as successful delivery', async () => {
  const { fetch } = intercept(307)
  expect(await notifyBotHealthFailure(env, failure, now)).toBe('failed')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('reports network delivery failure without leaking the thrown URL', async () => {
  const { fetch, errors } = intercept()
  fetch.mockImplementation(
    Object.assign(
      async () => {
        throw new Error(webhook)
      },
      { preconnect: () => {} }
    )
  )
  expect(await notifyBotHealthFailure(env, failure, now)).toBe('failed')
  expect(JSON.stringify(errors.mock.calls)).toContain('webhook network failure')
  expect(JSON.stringify(errors.mock.calls)).not.toContain('fixture-webhook-token')
})
