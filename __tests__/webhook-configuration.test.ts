import { expect, spyOn, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import adminRoutes from '@api/routes/admin/index'
import botRoutes from '@api/routes/admin-bot'
import { detectionConfiguration, EVENT_DETECTION_MODEL_KEY } from '@api/services/webhook-config'
import type { Bindings } from '@api/types/bindings'
import { OpenAPIHono } from '@hono/zod-openapi'
import { csrf } from 'hono/csrf'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const withKV = async (run: (env: Bindings) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-configuration-test',
      modules: true,
      script: 'export default { fetch(){return new Response("test")} }',
      compatibilityDate: '2026-05-11',
      kvNamespaces: ['BICCAME_MUSUME_EVENTS']
    })
  )
  try {
    await run(await mf.getBindings<Bindings>())
  } finally {
    await mf.dispose()
  }
}

const save = (model: unknown, env: object) =>
  botRoutes.request(
    '/admin/bot/configuration',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model)
    },
    env
  )

test('missing override uses environment bootstrap or clef default; valid override wins', async () => {
  await withKV(async (env) => {
    expect((await detectionConfiguration(env)).model).toBe('clef')
    expect((await detectionConfiguration({ ...env, EVENT_DETECTION_MODEL: 'clef-flash' })).model).toBe('clef-flash')
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, 'clef')
    expect((await detectionConfiguration({ ...env, EVENT_DETECTION_MODEL: 'clef-flash' })).model).toBe('clef')
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, 'clef-flash')
    expect((await detectionConfiguration(env)).model).toBe('clef-flash')
  })
})

test('invalid stored model warns without disclosing stored data and falls back to bootstrap', async () => {
  await withKV(async (env) => {
    await env.BICCAME_MUSUME_EVENTS.put(EVENT_DETECTION_MODEL_KEY, 'synthetic-invalid-private-value')
    const warning = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect((await detectionConfiguration({ ...env, EVENT_DETECTION_MODEL: 'clef-flash' })).model).toBe('clef-flash')
      expect((await detectionConfiguration(env)).model).toBe('clef')
      expect(warning).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(warning.mock.calls)).not.toContain('synthetic-invalid-private-value')
    } finally {
      warning.mockRestore()
    }
  })
})

test('save validates the exact model payload before writing and never reads eventual KV back', async () => {
  const writes: unknown[] = []
  const env = {
    BICCAME_MUSUME_EVENTS: {
      get: async () => {
        throw new Error('Save must not read KV')
      },
      put: async (key: string, value: string) => {
        writes.push([key, value])
      }
    }
  }
  for (const payload of [{ model: 'other' }, { model: 'clef', extra: true }, {}, { model: null }]) {
    expect((await save(payload, env)).status).toBe(400)
  }
  expect(writes).toHaveLength(0)
  for (const model of ['clef', 'clef-flash']) {
    const response = await save({ model }, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body: unknown = await response.json()
    expect(body).toEqual({ model })
  }
  expect(writes).toEqual([
    [EVENT_DETECTION_MODEL_KEY, 'clef'],
    [EVENT_DETECTION_MODEL_KEY, 'clef-flash']
  ])
})

test('KV read/write errors and missing mandatory binding fail safely rather than using default', async () => {
  const env = {
    BICCAME_MUSUME_EVENTS: {
      get: async () => {
        throw new Error('synthetic-private-get-error')
      },
      put: async () => {
        throw new Error('synthetic-private-put-error')
      }
    }
  }
  for (const environment of [env, {}]) {
    for (const path of ['/admin/bot/status', '/admin/bot/connection']) {
      const response = await botRoutes.request(
        path,
        { method: path.endsWith('/connection') ? 'POST' : 'GET' },
        environment
      )
      expect(response.status).toBe(503)
      const body: unknown = await response.json()
      expect(body).toEqual({ error: 'configuration_unavailable' })
    }
    const response = await save({ model: 'clef-flash' }, environment)
    expect(response.status).toBe(503)
    const body: unknown = await response.json()
    expect(body).toEqual({ error: 'configuration_unavailable' })
  }
})

test('configuration mutation remains protected by Cloudflare Access and CSRF middleware', async () => {
  const writes: string[] = []
  const env = {
    ENVIRONMENT: 'prod',
    BICCAME_MUSUME_EVENTS: {
      put: async () => {
        writes.push('write')
      }
    }
  }
  const response = await adminRoutes.request(
    '/admin/bot/configuration',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'clef-flash' })
    },
    env
  )
  expect(response.status).toBe(401)
  const app = new OpenAPIHono<{ Bindings: Bindings }>()
  app.use('/api/*', csrf())
  app.route('/api', adminRoutes)
  const rejected = await app.request(
    'https://app.example.invalid/api/admin/bot/configuration',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Sec-Fetch-Site': 'cross-site',
        Origin: 'https://attacker.example.invalid'
      },
      body: JSON.stringify({ model: 'clef-flash' })
    },
    { ...env, ENVIRONMENT: 'local' }
  )
  expect(rejected.status).toBe(403)
  expect(writes).toHaveLength(0)
  const entrypoint = await readFile('workers/web/src/index.ts', 'utf8')
  expect(entrypoint).toContain("app.use('/api/*'")
  expect(entrypoint).toContain('return csrfProtection(c, next)')
  expect(entrypoint).not.toContain("c.req.path === '/api/admin/bot/configuration'")
})
