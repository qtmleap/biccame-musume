import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Miniflare } from 'miniflare'
import { z } from 'zod'

// 検証済み候補bundleを、通知フラグ有効・外部通信完全mockで1回だけ実行する。
const manifestPath = process.argv.find((argument) => argument.startsWith('--manifest='))?.slice(11)
if (!manifestPath) throw new Error('Pass --manifest= for an isolated phase 2 build')
const manifest = z.object({ configPath: z.string().nonempty(), bundleSha256: z.string().regex(/^[a-f0-9]{64}$/) })
  .safeParse(JSON.parse(readFileSync(resolve(manifestPath), 'utf8')))
if (!manifest.success) throw new Error('Invalid phase 2 manifest')
const config = z.object({ main: z.string().nonempty(), compatibility_date: z.string().nonempty(), compatibility_flags: z.array(z.string().nonempty()) })
  .safeParse(JSON.parse(readFileSync(manifest.data.configPath, 'utf8')))
if (!config.success) throw new Error('Invalid phase 2 configuration')
const bundle = readFileSync(resolve(dirname(manifest.data.configPath), config.data.main))
if (new Bun.CryptoHasher('sha256').update(bundle).digest('hex') !== manifest.data.bundleSha256) throw new Error('Bundle hash mismatch')
const root = resolve(import.meta.dirname, '..')
const html = readFileSync(resolve(root, '__tests__/x-transaction/fixtures/x-home.html'), 'utf8')
const ondemand = readFileSync(resolve(root, '__tests__/x-transaction/fixtures/ondemand.s.js'), 'utf8')
// 現行窓は秒を0に切り捨てるため、確実に下端以上となる2分前を使う。
const created = new Date(Date.now() - 2 * 60 * 1000).toUTCString()
const discord: unknown[] = []
let analyses = 0
let searches = 0
const searchResult = { data: { search_by_raw_query: { search_timeline: { timeline: { instructions: [{ entries: [
  { content: { itemContent: { tweet_results: { result: {
    core: { user_results: { result: { core: { name: '架空の店舗', screen_name: 'bic_abeno' } } } },
    legacy: { id_str: '12345', created_at: created, full_text: '架空の名刺配布開始' }
  } } } } }
] }] } } } } }
const mf = new Miniflare({ workers: [{
  config: {
    type: 'worker', name: 'musume-workers', compatibilityDate: config.data.compatibility_date,
    compatibilityFlags: config.data.compatibility_flags,
    env: Object.fromEntries(Object.entries({
      TL_NOTIFICATIONS_ENABLED: 'true', TWITTER_BEARER_TOKEN: 'synthetic', TWITTER_AUTH_TOKEN: 'synthetic',
      TWITTER_CSRF_TOKEN: 'synthetic', DISCORD_CHANNEL_ID: '123', DISCORD_TOKEN: 'synthetic',
      OPENAI_API_KEY: 'synthetic', OPENAI_BASE_URL: 'https://ai.invalid/v1', OPENAI_MODEL: 'synthetic'
    }).map(([key, value]) => [key, { type: 'json', value }])),
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: bundle } } }
  },
  dev: { outboundService: { type: 'fetcher', handler: async (request) => {
    const url = new URL(request.url)
    if (url.hostname === 'x.com' && ['/', '/home'].includes(url.pathname)) return new Response(html)
    if (url.hostname === 'abs.twimg.com' && url.pathname.includes('ondemand.s.')) return new Response(ondemand)
    if (url.hostname === 'x.com' && url.pathname.endsWith('/SearchTimeline')) {
      searches++
      return Response.json(searchResult)
    }
    if (url.href === 'https://ai.invalid/v1/responses') {
      analyses++
      return Response.json({ id: 'synthetic', object: 'response', status: 'completed', output: [{
        type: 'message', id: 'synthetic-message', role: 'assistant', status: 'completed', content: [{
          type: 'output_text', annotations: [], text: JSON.stringify({ events: [{
            isDistributionEvent: true, eventType: 'start', title: '架空名刺', category: 'limited_card',
            startDate: '2026-10-04', endDate: '', endAt: ''
          }] })
        }]
      }] })
    }
    if (url.href === 'https://discord.com/api/v10/channels/123/messages') {
      discord.push(await request.json())
      return Response.json({ id: 'synthetic-message' })
    }
    throw new Error('Unexpected external request in timeline integration test')
  } } }
}] })
try {
  const bot = await mf.getWorker('musume-workers')
  await bot.scheduled({ cron: '*/5 0-12 * * *', scheduledTime: Date.now() })
  assert.equal(searches, 1)
  assert.equal(analyses, 1)
  assert.equal(discord.length, 1)
  assert.match(JSON.stringify(discord[0]), /admin\/events\//)
  console.log(`Phase 2 timeline integration passed for ${manifest.data.bundleSha256}`)
} finally { await mf.dispose() }
