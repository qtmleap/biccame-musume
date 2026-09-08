import { expect, test } from '@playwright/test'

/**
 * 投票の 1 日 1 回制限 (VoteCounterDO の daily_voted) の E2E。
 *
 * DO クラスは bun が `cloudflare:workers` を解決できずユニットテストできないため、
 * 実際に INSERT OR IGNORE が効いているかはここでしか確認できない。
 *
 * 前提: playwright.config.ts が E2E=1 で dev を起動し VOTE_LIMIT_BYPASS を false にする。
 * DO storage は実行をまたいで残るので、テストごとに別 IP を使って冪等にする。
 */

const CHARACTER_ID = 'sapporo'

/** 実行をまたいで衝突しにくいアドレスを作る (100.64.0.0/10 は CGNAT 用の予約帯) */
const uniqueIp = (): string => {
  const b = Math.floor(Math.random() * 64) + 64
  const c = Math.floor(Math.random() * 256)
  const d = Math.floor(Math.random() * 254) + 1
  return `100.${b}.${c}.${d}`
}

// Origin は playwright.config.ts の extraHTTPHeaders で付与される
const buildHeaders = (ip: string) => ({
  'CF-Connecting-IP': ip,
  'Content-Type': 'application/json'
})

test('同一 IP × 同一キャラの 2 回目の投票は 400 になる', async ({ request }) => {
  const headers = buildHeaders(uniqueIp())

  const first = await request.post(`/api/votes/${CHARACTER_ID}`, { headers })
  expect(first.status()).toBe(200)

  const second = await request.post(`/api/votes/${CHARACTER_ID}`, { headers })
  expect(second.status()).toBe(400)
})

test('IP が違えば同じキャラに投票できる', async ({ request }) => {
  const first = await request.post(`/api/votes/${CHARACTER_ID}`, { headers: buildHeaders(uniqueIp()) })
  expect(first.status()).toBe(200)

  const second = await request.post(`/api/votes/${CHARACTER_ID}`, { headers: buildHeaders(uniqueIp()) })
  expect(second.status()).toBe(200)
})

test('bulk 投票の 2 回目は全件 skipped になる', async ({ request }) => {
  const headers = buildHeaders(uniqueIp())
  const data = { characterIds: ['sapporo', 'akiba'] }

  const first = await request.post('/api/votes/bulk', { headers, data })
  expect(first.status()).toBe(200)
  const firstBody = await first.json()
  expect(firstBody.votedCount).toBe(2)
  expect(firstBody.skippedCount).toBe(0)

  const second = await request.post('/api/votes/bulk', { headers, data })
  expect(second.status()).toBe(200)
  const secondBody = await second.json()
  expect(secondBody.votedCount).toBe(0)
  expect(secondBody.skippedCount).toBe(2)
})

test('bulk は投票済みのぶんだけ skipped にして残りを通す', async ({ request }) => {
  const headers = buildHeaders(uniqueIp())

  const first = await request.post('/api/votes/bulk', { headers, data: { characterIds: ['sapporo'] } })
  expect(first.status()).toBe(200)

  const second = await request.post('/api/votes/bulk', { headers, data: { characterIds: ['sapporo', 'akiba'] } })
  const body = await second.json()
  expect(body.votedCount).toBe(1)
  expect(body.skippedCount).toBe(1)
  expect(body.results).toEqual([
    { characterId: 'sapporo', status: 'skipped' },
    { characterId: 'akiba', status: 'voted' }
  ])
})
