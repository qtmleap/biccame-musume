/**
 * 一括投票 API を直接叩いて計測する。
 * dev (env.ENVIRONMENT === 'local') では rate limit が無視されるので
 * 同じ characterIds で何度でも voted で投票できる。
 * staging/prod は rate limit が効くので 2 回目以降は全員 skipped になり、
 * isVoteLimited 並列化の効果 (KV ラウンドトリップ削減) が観察できる。
 *
 * 使い方:
 *   BASE_URL=http://localhost:15175       bun run scripts/measure-bulk-vote.mjs   # dev
 *   BASE_URL=https://dev.biccame-musume.com bun run scripts/measure-bulk-vote.mjs # staging
 */
import { request } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:15175'

const characters = JSON.parse(readFileSync('./public/characters.json', 'utf-8'))
const ALL = characters
  .filter((c) => c.character?.is_biccame_musume === true)
  .map((c) => c.id)

console.log(`total biccame: ${ALL.length}`)

const ctx = await request.newContext()

const measure = async (label, ids) => {
  const t0 = Date.now()
  const res = await ctx.post(`${BASE}/api/votes/bulk`, {
    data: { characterIds: ids },
    headers: { 'content-type': 'application/json' }
  })
  const elapsed = Date.now() - t0
  const body = await res.json()
  const voted = body.results?.filter((r) => r.status === 'voted').length ?? 0
  const skipped = body.results?.filter((r) => r.status === 'skipped').length ?? 0
  console.log(`${label}: total=${elapsed}ms n=${ids.length} voted=${voted} skipped=${skipped}`)
  return elapsed
}

// ウォームアップ (cold start を除外)
await measure('warmup', ALL.slice(0, 1))

// 本計測
console.log('---')
await measure('all-biccame x1', ALL)
await measure('all-biccame x2', ALL)
await measure('all-biccame x3', ALL)

await ctx.dispose()
