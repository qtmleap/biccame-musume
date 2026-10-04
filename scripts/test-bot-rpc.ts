import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { type DevConfig, Miniflare } from 'miniflare'
import { z } from 'zod'

const root = resolve(import.meta.dirname, '..')
const pointer = resolve(root, 'workers/bot/.wrangler/deploy/config.json')
const pointerSchema = z.object({ configPath: z.string().nonempty() })
const parsedPointer = pointerSchema.safeParse(JSON.parse(readFileSync(pointer, 'utf8')))
if (!parsedPointer.success) throw new Error('Build the bot before testing RPC')
const configPath = resolve(dirname(pointer), parsedPointer.data.configPath)
const configSchema = z.object({
  main: z.string().nonempty(),
  name: z.string().nonempty(),
  compatibility_date: z.string().nonempty(),
  compatibility_flags: z.array(z.string().nonempty()),
  triggers: z.object({ crons: z.array(z.string().nonempty()).length(0) }),
  services: z.array(z.object({ binding: z.string().nonempty(), service: z.string().nonempty(), entrypoint: z.string().nonempty() })),
  d1_databases: z.array(z.unknown()).length(0),
  vars: z.strictObject({
    OPENAI_BASE_URL: z.literal('https://ai.qleap.jp/v1'),
    OPENAI_MODEL: z.literal('codex,gpt-5.6-luna'),
    TL_NOTIFICATIONS_ENABLED: z.literal('false'),
    X_POSTING_ENABLED: z.literal('false'),
    X_ACCOUNT_READ_ENABLED: z.literal('false')
  })
})
const parsed = configSchema.safeParse(JSON.parse(readFileSync(configPath, 'utf8')))
if (!parsed.success) throw new Error('Invalid skeleton build configuration')
const config = parsed.data
if (process.env.BICCAME_BOT_RPC !== '1') assert.deepEqual(config.services, [])
else {
  const { botAppBinding } = await import('./worker-bindings.ts')
  assert.deepEqual(config.services, [botAppBinding(process.env.CLOUDFLARE_ENV)])
}
const dev: DevConfig = {
  outboundService: {
    type: 'fetcher',
    handler: () => { throw new Error('External communication is forbidden in RPC tests') }
  }
}
const mf = new Miniflare({
  workers: [
    {
      config: {
        type: 'worker',
        name: 'mock-app',
        compatibilityDate: config.compatibility_date,
        env: { BOT: { type: 'worker', workerName: config.name, exportName: 'BotService' } },
        manifest: {
          mainModule: 'index.js',
          modules: {
            'index.js': {
              type: 'esm',
              contents: `export default {
                async fetch(request, env) {
                  try {
                    const path = new URL(request.url).pathname;
                    if (path === '/account') return Response.json(await env.BOT.accountStatus());
                    const input = await request.json();
                    if (path === '/announce') return Response.json(await env.BOT.announce(input));
                    return Response.json(await env.BOT.ping(input));
                  } catch {
                    return new Response('Invalid bot ping request', { status: 400 });
                  }
                }
              }`
            }
          }
        }
      },
      dev
    },
    {
      config: {
        type: 'worker',
        name: config.name,
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        manifest: {
          mainModule: 'index.js',
          modules: {
            'index.js': { type: 'esm', contents: readFileSync(resolve(dirname(configPath), config.main), 'utf8') }
          }
        }
      },
      dev
    }
  ]
})
try {
  const response = await mf.dispatchFetch('http://localhost/ping', {
    method: 'POST',
    body: JSON.stringify({ requestId: 'rpc-test' })
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    requestId: 'rpc-test', service: 'bot', phase: 'posting', notificationsEnabled: false
  })
  for (const input of [{ requestId: '' }, { requestId: 'test', secret: 'not-a-secret' }, {}]) {
    const rejected = await mf.dispatchFetch('http://localhost/ping', { method: 'POST', body: JSON.stringify(input) })
    assert.equal(rejected.status, 400)
  }
  const disabled = await mf.dispatchFetch('http://localhost/announce', {
    method: 'POST', body: JSON.stringify({ eventUUID: '550e8400-e29b-41d4-a716-446655440000',
      revision: '2026-10-03T00:00:00Z', purpose: 'created', text: 'Synthetic announcement' })
  })
  assert.deepEqual(await disabled.json(), { status: 'disabled' })
  const account = await mf.dispatchFetch('http://localhost/account')
  assert.deepEqual(await account.json(), { ok: false, kind: 'disabled' })
  const bot = await mf.getWorker(config.name)
  assert.equal((await bot.fetch('http://localhost/')).status, 404)
  console.log('Bot Service Binding RPC: passed (external communication disabled)')
} finally {
  await mf.dispose()
}
