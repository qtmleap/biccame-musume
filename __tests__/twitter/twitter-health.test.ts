import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Twitter } from '../../workers/app/src/utils/twitter'
import { TwitterHealthError } from '../../workers/app/src/utils/twitter-health'

const homePageHtml = readFileSync(`${import.meta.dir}/../x-transaction/fixtures/x-home.html`, 'utf8')
const ondemandFileText = readFileSync(`${import.meta.dir}/../x-transaction/fixtures/ondemand.s.js`, 'utf8')
const originalCaches = globalThis.caches
const env = { TWITTER_AUTH_TOKEN: 'fixture-auth', TWITTER_CSRF_TOKEN: 'fixture-csrf' } as never
const endpoint = 'https://api.x.com/1.1/account/settings.json'

beforeEach(() => {
  globalThis.caches = {
    open: async () => ({
      match: async () => new Response(JSON.stringify({ homePageHtml, ondemandFileText })),
      put: async () => {}
    })
  } as unknown as CacheStorage
})
afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore()
  globalThis.caches = originalCaches
})

const respond = (body: unknown, status = 200) =>
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(async () => Response.json(body, { status }), { preconnect: () => {} })
  )

const expectFailure = async (kind: TwitterHealthError['kind']) => {
  try {
    await new Twitter(env).checkAuthenticatedSession()
    throw new Error('Expected health failure')
  } catch (error) {
    expect(error).toBeInstanceOf(TwitterHealthError)
    if (!(error instanceof TwitterHealthError)) throw error
    expect(error.kind).toBe(kind)
    expect(error.message).not.toContain('fixture-auth')
    expect(error.message).not.toContain('sensitive upstream detail')
  }
}

test('checks Cookie-authenticated settings instead of the fixed public profile', async () => {
  const fetch = respond({ screen_name: '_BICCAME_MUSUME' })
  await new Twitter(env).checkAuthenticatedSession()
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, init] = fetch.mock.calls[0]
  expect(url).toBe(endpoint)
  expect(init?.method).toBe('GET')
  expect(init?.redirect).toBe('manual')
  const headers = new Headers(init?.headers)
  expect(headers.get('cookie')).toBe('auth_token=fixture-auth; ct0=fixture-csrf')
  expect(headers.get('x-csrf-token')).toBe('fixture-csrf')
  expect(headers.get('x-client-transaction-id')).toBeTruthy()
  expect(init?.signal).toBeDefined()
})

test('treats an unfollowed redirect as an unverified identity', async () => {
  const fetch = respond({ screen_name: '_biccame_musume' }, 302)
  await expectFailure('unexpected_response')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('does not cache the authenticated settings result', async () => {
  const fetch = respond({ screen_name: '_biccame_musume' })
  await new Twitter(env).checkAuthenticatedSession()
  await new Twitter(env).checkAuthenticatedSession()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('rejects missing Cookie configuration without sending requests', async () => {
  const fetch = respond({ screen_name: '_biccame_musume' })
  await expect(
    new Twitter({ TWITTER_AUTH_TOKEN: '', TWITTER_CSRF_TOKEN: 'fixture' } as never).checkAuthenticatedSession()
  ).rejects.toMatchObject({ kind: 'missing_credentials' })
  await expect(
    new Twitter({ TWITTER_AUTH_TOKEN: 'fixture', TWITTER_CSRF_TOKEN: ' ' } as never).checkAuthenticatedSession()
  ).rejects.toMatchObject({ kind: 'missing_credentials' })
  expect(fetch).not.toHaveBeenCalled()
})

for (const [name, body, status, kind] of [
  ['expired Cookie', { errors: [{ code: 89, message: 'sensitive upstream detail' }] }, 401, 'authentication'],
  ['200 auth error', { errors: [{ code: 32 }] }, 200, 'authentication'],
  ['invalid CSRF', { errors: [{ code: 353 }] }, 403, 'authentication'],
  ['forbidden', { errors: [{ code: 0 }] }, 403, 'authorization'],
  ['locked', { errors: [{ code: 326 }] }, 200, 'authorization'],
  ['suspended', { errors: [{ code: 64 }] }, 200, 'authorization'],
  ['rate limit', {}, 429, 'rate_limit'],
  ['200 rate limit', { errors: [{ code: 88 }] }, 200, 'rate_limit'],
  ['upstream failure', {}, 503, 'upstream'],
  ['wrong account', { screen_name: 'other_fixture' }, 200, 'account_mismatch'],
  ['missing account', {}, 200, 'unexpected_response'],
  ['malformed account', { screen_name: 42 }, 200, 'unexpected_response'],
  [
    'unknown errors with account',
    { screen_name: '_biccame_musume', errors: [{ code: 999 }] },
    200,
    'unexpected_response'
  ],
  ['unknown HTTP failure', {}, 404, 'unexpected_response']
] as const) {
  test(`classifies ${name} without leaking the response`, async () => {
    respond(body, status)
    await expectFailure(kind)
  })
}

test('rejects non-JSON responses', async () => {
  const fetch = respond({})
  fetch.mockImplementation(
    Object.assign(async () => new Response('sensitive upstream detail'), { preconnect: () => {} })
  )
  await expectFailure('unexpected_response')
})

test('classifies a non-JSON forbidden response as authorization failure', async () => {
  const fetch = respond({})
  fetch.mockImplementation(
    Object.assign(async () => new Response('sensitive upstream detail', { status: 403 }), { preconnect: () => {} })
  )
  await expectFailure('authorization')
})

test('classifies network errors without exposing request URLs or secrets', async () => {
  const fetch = respond({})
  fetch.mockImplementation(
    Object.assign(
      async () => {
        throw new Error('fixture-auth sensitive upstream detail')
      },
      { preconnect: () => {} }
    )
  )
  await expectFailure('network')
})

test('classifies timeout as network failure', async () => {
  const fetch = respond({})
  fetch.mockImplementation(
    Object.assign(
      async () => {
        throw new DOMException('timeout', 'TimeoutError')
      },
      { preconnect: () => {} }
    )
  )
  await expectFailure('network')
})

test('classifies response body timeout as network failure', async () => {
  const response = Response.json({ screen_name: '_biccame_musume' })
  spyOn(response, 'json').mockRejectedValue(new DOMException('fixture-auth', 'AbortError'))
  const fetch = respond({})
  fetch.mockImplementation(Object.assign(async () => response, { preconnect: () => {} }))
  await expectFailure('network')
})

test('classifies signature acquisition failure separately', async () => {
  globalThis.caches = {
    open: async () => {
      throw new Error('sensitive upstream detail')
    }
  } as unknown as CacheStorage
  const fetch = respond({ screen_name: '_biccame_musume' })
  await expectFailure('signature')
  expect(fetch).not.toHaveBeenCalled()
})
