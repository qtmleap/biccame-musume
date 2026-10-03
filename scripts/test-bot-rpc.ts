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
  services: z.array(z.unknown()).length(0),
  d1_databases: z.array(z.unknown()).length(0),
  vars: z.record(z.string().nonempty(), z.unknown()).refine((vars) => Object.keys(vars).length === 0)
})
const parsed = configSchema.safeParse(JSON.parse(readFileSync(configPath, 'utf8')))
if (!parsed.success) throw new Error('Invalid skeleton build configuration')
const config = parsed.data
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
                    return Response.json(await env.BOT.ping(await request.json()));
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
    requestId: 'rpc-test', service: 'bot', phase: 'skeleton', notificationsEnabled: false
  })
  for (const input of [{ requestId: '' }, { requestId: 'test', secret: 'not-a-secret' }, {}]) {
    const rejected = await mf.dispatchFetch('http://localhost/ping', { method: 'POST', body: JSON.stringify(input) })
    assert.equal(rejected.status, 400)
  }
  const bot = await mf.getWorker(config.name)
  assert.equal((await bot.fetch('http://localhost/')).status, 404)
  console.log('Bot Service Binding RPC: passed (external communication disabled)')
} finally {
  await mf.dispose()
}
