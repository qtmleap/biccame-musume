import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { characters } from '../workers/bot/src/timeline/data/characters'
import type { Bindings } from '../workers/bot/src/timeline/utils/bindings'
import { post, type TweetInfo } from '../workers/bot/src/timeline/utils/post'

// 固定SHAで取得・読込済みの旧ソースとの比較専用。入力も応答も架空データ。
const source = process.argv.find((argument) => argument.startsWith('--source='))?.slice(9)
if (!source) throw new Error('Pass the inspected upstream source directory with --source=')
const legacy = await import(resolve(source, 'src/lib/utils/post.ts'))
const legacyCharacters = await import(resolve(source, 'src/lib/data/characters.ts'))
assert.deepEqual(characters, legacyCharacters.characters)
const env: Bindings = {
  TWITTER_AUTH_TOKEN: 'synthetic', TWITTER_CSRF_TOKEN: 'synthetic', TWITTER_BEARER_TOKEN: 'synthetic',
  DISCORD_TOKEN: 'synthetic', DISCORD_CHANNEL_ID: '123',
  OPENAI_API_KEY: 'synthetic', OPENAI_BASE_URL: 'https://ai.invalid/v1', OPENAI_MODEL: 'synthetic'
}
const tweet: TweetInfo = {
  id: '12345', name: '架空の店舗', screenName: 'bic_abeno', createdAt: '2026-10-03T00:02:00Z',
  text: '比較専用の架空の配布案内', url: 'https://x.com/bic_abeno/status/12345'
}
const events = [
  { isDistributionEvent: false, eventType: '', title: '', category: '', startDate: '', endDate: '', endAt: '' },
  { isDistributionEvent: true, eventType: 'start', title: '架空名刺', category: 'limited_card', startDate: '2026-10-03', endDate: '', endAt: '' },
  { isDistributionEvent: true, eventType: 'end', title: '架空アクキー', category: 'ackey', startDate: '', endDate: '2026-10-04', endAt: '2026-10-03' }
]
const originalFetch = globalThis.fetch
const compare = async (execute: (env: Bindings, tweet: TweetInfo) => Promise<unknown>) => {
  const notifications: unknown[] = []
  const analyses: unknown[] = []
  globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const body = await request.json()
    if (url.hostname === 'ai.invalid' && url.pathname === '/v1/responses') {
      analyses.push(body)
      return Response.json({ id: 'synthetic', status: 'completed', object: 'response', output: [{
        type: 'message', role: 'assistant', id: 'synthetic-message', status: 'completed',
        content: [{ type: 'output_text', text: JSON.stringify({ events }), annotations: [] }]
      }] })
    }
    if (url.hostname === 'discord.com' && url.pathname === '/api/v10/channels/123/messages') {
      notifications.push(body)
      return Response.json({ id: 'synthetic-message' })
    }
    throw new Error('Unexpected external request in migration comparison')
  }, { preconnect: () => {} })
  try {
    await execute(env, tweet)
    await execute(env, { ...tweet, screenName: 'unknown-synthetic-store' })
    return { notifications, analyses }
  } finally {
    globalThis.fetch = originalFetch
  }
}
const before = await compare(legacy.post)
const after = await compare(post)
assert.deepEqual(after, before)
assert.equal(after.notifications.length, 2)
console.log(`Bot migration comparison passed: ${characters.length} store mappings, AI requests and 2 Discord payloads match`)
