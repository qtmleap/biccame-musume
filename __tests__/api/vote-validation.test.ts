import { beforeEach, expect, mock, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import type { Bindings } from '../../src/types/bindings'

const db = {
  $transaction: mock(async (ops: unknown[]) => ops),
  voteCount: { upsert: mock((input: unknown) => input), findMany: mock(async () => []) },
  vote: { create: mock((input: unknown) => input), createMany: mock((input: unknown) => input) }
}
const getPrisma = mock(() => db)
mock.module('@/lib/prisma', () => ({ getPrisma }))
const { default: routes } = await import('../../src/api/vote')
const { vote, bulkVote } = await import('../../src/services/vote-service')
const { loadBiccameMusumeIdSet } = await import('../../src/utils/character-whitelist')
const characters = [
  { id: 'sapporo', character: { is_biccame_musume: true } },
  { id: 'akiba', character: { is_biccame_musume: true } },
  { id: 'other', character: { is_biccame_musume: false } }
]
const fixture = (fetch = async () => Response.json(characters)) => {
  const claimVotes = mock(async ({ characterIds }: { characterIds: string[] }) => ({
    voted: characterIds,
    skipped: []
  }))
  const idFromName = mock((name: string) => name)
  const get = mock(() => ({ claimVotes }))
  const limit = mock(async (_input: { key: string }) => ({ success: true }))
  const env = {
    ENVIRONMENT: 'production',
    ASSETS: { fetch },
    RATE_LIMITER: { limit },
    VOTE_COUNTER: { idFromName, get }
  } as unknown as Bindings
  const app = new OpenAPIHono<{ Bindings: Bindings }>()
  app.onError((error, c) => c.json({ message: error.message }, error instanceof HTTPException ? error.status : 500))
  app.route('/api/votes', routes)
  const post = (path: string, data?: unknown, headers: Record<string, string> = {}) =>
    app.request(
      `/api/votes/${path}`,
      {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.1', 'Content-Type': 'application/json', ...headers },
        ...(data === undefined ? {} : { body: JSON.stringify(data) })
      },
      env
    )
  return { app, env, post, claimVotes, idFromName, get, limit }
}
const noWrites = (f: ReturnType<typeof fixture>) => {
  expect(f.idFromName).not.toHaveBeenCalled()
  expect(f.get).not.toHaveBeenCalled()
  expect(f.claimVotes).not.toHaveBeenCalled()
  expect(getPrisma).not.toHaveBeenCalled()
  expect(db.$transaction).not.toHaveBeenCalled()
  expect(db.voteCount.upsert).not.toHaveBeenCalled()
  expect(db.vote.create).not.toHaveBeenCalled()
  expect(db.vote.createMany).not.toHaveBeenCalled()
}
beforeEach(() => {
  mock.clearAllMocks()
})
test('unknown_vote_id_has_no_side_effects', async () => {
  const f = fixture()
  expect((await f.post('unknown')).status).toBe(400)
  noWrites(f)
})
test('mixed_bulk_vote_is_rejected_before_claim', async () => {
  const f = fixture()
  expect((await f.post('bulk', { characterIds: ['sapporo', 'unknown'] })).status).toBe(400)
  noWrites(f)
})
test('authorization_changes_do_not_change_limit_bucket', async () => {
  const f = fixture()
  await f.post('sapporo', undefined, { Authorization: 'Bearer first' })
  await f.post('akiba', undefined, { Authorization: 'Bearer second' })
  expect(f.limit.mock.calls).toEqual([[{ key: 'vote:203.0.113.1' }], [{ key: 'vote:203.0.113.1' }]])
})
test('whitelist_failure_returns_503', async () => {
  const f = fixture(async () => new Response('', { status: 500 }))
  expect((await f.post('sapporo')).status).toBe(503)
  noWrites(f)
})
for (const [name, fetch] of [
  [
    'rejected fetch',
    async () => {
      throw new Error('offline')
    }
  ],
  ['invalid JSON', async () => new Response('{')],
  ['invalid schema', async () => Response.json({ invalid: true })]
] as const) {
  test(`whitelist failure: ${name}`, async () => {
    const f = fixture(fetch)
    expect((await f.post('bulk', { characterIds: ['sapporo'] })).status).toBe(503)
    noWrites(f)
  })
}
test('valid empty whitelist rejects unknown IDs with 400', async () => {
  const f = fixture(async () => Response.json([]))
  expect((await f.post('sapporo')).status).toBe(400)
  noWrites(f)
})
test('non eligible characters are rejected', async () => {
  const f = fixture()
  expect((await f.post('other')).status).toBe(400)
  noWrites(f)
})
test('direct service callers cannot bypass validation', async () => {
  const f = fixture()
  await expect(vote(f.env, 'unknown', '203.0.113.1')).rejects.toMatchObject({ status: 400 })
  await expect(bulkVote(f.env, ['sapporo', 'unknown'], '203.0.113.1')).rejects.toMatchObject({ status: 400 })
  noWrites(f)
})
test('failed whitelist loads retry and cached sets cannot be poisoned', async () => {
  let attempt = 0
  const f = fixture(async () => (++attempt === 1 ? new Response('', { status: 500 }) : Response.json(characters)))
  await expect(loadBiccameMusumeIdSet(f.env.ASSETS, 'https://local.test')).rejects.toMatchObject({ status: 503 })
  const ids = await loadBiccameMusumeIdSet(f.env.ASSETS, 'https://local.test')
  ids.add('unknown')
  expect((await f.post('unknown')).status).toBe(400)
  expect((await f.post('sapporo')).status).toBe(200)
  expect(attempt).toBe(2)
})
for (const ip of ['not-an-ip', '203.0.113.1, 203.0.113.2', '']) {
  test(`invalid production IP rejected before limiter: ${ip}`, async () => {
    const f = fixture()
    expect((await f.post('sapporo', undefined, { 'CF-Connecting-IP': ip })).status).toBe(403)
    expect(f.limit).not.toHaveBeenCalled()
    noWrites(f)
  })
}
test('IPv6 and local fallback remain supported', async () => {
  const f = fixture()
  expect((await f.post('sapporo', undefined, { 'CF-Connecting-IP': '2001:db8::1' })).status).toBe(200)
  f.env.ENVIRONMENT = 'local'
  expect((await f.post('akiba', undefined, { 'CF-Connecting-IP': '' })).status).toBe(200)
  expect(f.limit.mock.calls).toEqual([[{ key: 'vote:2001:db8::1' }], [{ key: 'vote:127.0.0.1' }]])
})
test('public GET does not require an IP or consume mutation limit', async () => {
  const f = fixture()
  expect((await f.app.request('/api/votes', {}, f.env)).status).toBe(200)
  expect(f.limit).not.toHaveBeenCalled()
})
test('exhausted limiter rejects before claim or DB', async () => {
  const f = fixture()
  f.limit.mockImplementation(async () => ({ success: false }))
  expect((await f.post('sapporo')).status).toBe(429)
  noWrites(f)
})

test('router loads assets from the incoming request origin', async () => {
  const f = fixture(async (request?: Request) => {
    expect(request?.url).toBe('http://localhost/characters.json')
    return Response.json(characters)
  })
  expect((await f.post('sapporo')).status).toBe(200)
})
