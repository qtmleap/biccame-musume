import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Miniflare } from 'miniflare'
import { z } from 'zod'

// 生成済みの本物のbot scheduled → named APP RPC → X threadを全通信mockで検証。
const root = resolve(import.meta.dirname, '..')
const pointer = resolve(root, 'workers/bot/.wrangler/deploy/config.json')
const parsedPointer = z.object({ configPath: z.string().nonempty() }).safeParse(JSON.parse(readFileSync(pointer, 'utf8')))
if (!parsedPointer.success) throw new Error('Build bot before testing daily RPC')
const outputPath = resolve(dirname(pointer), parsedPointer.data.configPath)
const parsed = z.object({ main: z.string().nonempty(), compatibility_date: z.string().nonempty(), compatibility_flags: z.array(z.string().nonempty()) })
  .safeParse(JSON.parse(readFileSync(outputPath, 'utf8')))
if (!parsed.success) throw new Error('Invalid bot build config')
const config = parsed.data
const html = readFileSync(resolve(root, '__tests__/x-transaction/fixtures/x-web-home.html'), 'utf8') +
  '<script src="https://abs.twimg.com/x-web/entry-client.synthetic.js"></script>'
const signer = readFileSync(resolve(root, '__tests__/x-transaction/fixtures/x-web-sign.js'), 'utf8')
const bundle = readFileSync(resolve(dirname(outputPath), config.main), 'utf8')
const posts: { text: string; replyTo?: string }[] = []
const requestedPaths: string[] = []
let healthChecks = 0
let refuseAuthentication = false
const mf = new Miniflare({ workers: [
  {
    config: {
      type: 'worker', name: 'mock-app-reader', compatibilityDate: config.compatibility_date,
      manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: `
        import { WorkerEntrypoint } from 'cloudflare:workers';
        let reads = 0;
        export class AppBotReadService extends WorkerEntrypoint {
          async dailyTargets(input) {
            reads++;
            if (typeof input.scheduledAt !== 'string') throw new Error('Date was not serialized');
            return { ok: true, targets: { scheduledAt: input.scheduledAt,
              starting: { eventUUIDs: ['550e8400-e29b-41d4-a716-446655440000'], texts: ['start one', 'start two'] },
              ending: { eventUUIDs: [], texts: ['end one'] }
            }};
          }
        }
        export default { fetch: () => Response.json({ reads }) };
      ` } } }
    },
    dev: { outboundService: { type: 'fetcher', handler: () => { throw new Error('No external app requests allowed') } } }
  },
  {
    config: {
      type: 'worker', name: 'bot-under-test', compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      env: {
        APP: { type: 'worker', workerName: 'mock-app-reader', exportName: 'AppBotReadService' },
        X_POSTING_ENABLED: { type: 'json', value: 'true' },
        TL_NOTIFICATIONS_ENABLED: { type: 'json', value: 'false' },
        TWITTER_AUTH_TOKEN: { type: 'json', value: 'synthetic-auth' },
        TWITTER_CSRF_TOKEN: { type: 'json', value: 'synthetic-csrf' }
      },
      manifest: { mainModule: 'index.js', modules: {
        'index.js': { type: 'esm', contents: bundle }
      } }
    },
    dev: { outboundService: { type: 'fetcher', handler: async (request) => {
      const url = new URL(request.url)
      requestedPaths.push(`${url.hostname}${url.pathname}`)
      if (url.hostname === 'x.com' && ['/', '/home'].includes(url.pathname)) return new Response(html)
      if (url.href === 'https://abs.twimg.com/x-web/entry-client.synthetic.js') return new Response('import "./sign.synthetic.js";')
      if (url.href === 'https://abs.twimg.com/x-web/sign.synthetic.js') return new Response(signer)
      if (url.hostname === 'api.x.com' && url.pathname === '/1.1/account/settings.json') {
        healthChecks++
        return refuseAuthentication ? Response.json({ errors: [{ code: 89 }] }, { status: 401 })
          : Response.json({ screen_name: '_biccame_musume' })
      }
      if (url.hostname === 'x.com' && url.pathname.endsWith('/CreateTweet')) {
        const body = z.object({ variables: z.object({ tweet_text: z.string().nonempty(),
          reply: z.object({ in_reply_to_tweet_id: z.string().nonempty() }).optional()
        }) }).safeParse(await request.json())
        if (!body.success) throw new Error('Invalid synthetic CreateTweet request')
        posts.push({ text: body.data.variables.tweet_text, replyTo: body.data.variables.reply?.in_reply_to_tweet_id })
        return Response.json({ data: { create_tweet: { tweet_results: { result: { rest_id: String(posts.length) } } } } })
      }
      throw new Error('Unexpected external request during daily RPC test')
    } } }
  }
] })
try {
  const bot = await mf.getWorker('bot-under-test')
  await bot.scheduled({ cron: '0 0 * * *', scheduledTime: Date.parse('2026-10-03T00:00:00Z') })
  assert.equal(healthChecks, 1, JSON.stringify(requestedPaths))
  assert.equal(posts.length, 3)
  assert.deepEqual(posts.filter((post) => post.text.startsWith('start')), [
    { text: 'start one', replyTo: undefined }, { text: 'start two', replyTo: String(posts.findIndex((post) => post.text === 'start one') + 1) }
  ])
  assert.deepEqual(posts.filter((post) => post.text.startsWith('end')), [{ text: 'end one', replyTo: undefined }])
  const app = await mf.getWorker('mock-app-reader')
  assert.deepEqual(await (await app.fetch('https://mock.local/')).json(), { reads: 1 })
  refuseAuthentication = true
  await bot.scheduled({ cron: '0 0 * * *', scheduledTime: Date.parse('2026-10-04T00:00:00Z') })
  assert.equal(healthChecks, 2)
  assert.equal(posts.length, 3)
  assert.deepEqual(await (await app.fetch('https://mock.local/')).json(), { reads: 1 })
  await bot.scheduled({ cron: '*/5 0-12 * * *', scheduledTime: Date.parse('2026-10-04T00:00:00Z') })
  assert.equal(healthChecks, 2)
  assert.equal(posts.length, 3)
  console.log('Bot daily RPC: passed (real generated bot, mock X and named app reader, no external requests)')
} finally { await mf.dispose() }
