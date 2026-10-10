import { afterEach, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runArchive } from '../scripts/lib/post-archive'

const scope = { listId: '123', from: '2025-10-07T15:00:00.000Z', until: '2026-10-08T03:00:00.000Z' }
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const root = async () => {
  const path = await mkdtemp(join(tmpdir(), 'archive-range-'))
  roots.push(path)
  return path
}
const tweet = (id: string, createdAt = '2026-10-07T23:00:00Z') => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: { rest_id: '42', core: { name: '店', screen_name: 'bic_test' } } } },
  legacy: { id_str: id, created_at: createdAt, full_text: '投稿', entities: { hashtags: [] } }
})
const page = (tweets: unknown[], cursor?: string) => ({
  data: {
    search_by_raw_query: {
      search_timeline: {
        timeline: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                ...tweets.map((result) => ({ content: { itemContent: { tweet_results: { result } } } })),
                ...(cursor ? [{ content: { cursorType: 'Bottom', value: cursor } }] : [])
              ]
            }
          ]
        }
      }
    }
  }
})
const legacyScope = (range = scope) => ({
  schema: 2,
  queryVersion: 1,
  queryMode: 'jst_calendar_days',
  product: 'Latest',
  count: 20,
  exhaustionPolicy: { version: 1, consecutiveReplacementPairs: 3 },
  ...range,
  query: `list:${range.listId} since:2025-10-07 until:2026-10-10`
})
const legacy = async (path: string) => {
  await mkdir(join(path, 'pages'), { recursive: true })
  const record = legacyScope()
  const scopeFingerprint = createHash('sha256').update(JSON.stringify(record)).digest('hex')
  await writeFile(join(path, 'scope.json'), JSON.stringify(record))
  await writeFile(
    join(path, 'pages', '000001.json'),
    JSON.stringify({
      version: 1,
      scopeFingerprint,
      index: 1,
      sliceIndex: 0,
      query: 'list:123 since:2025-10-07 until:2025-10-10',
      response: page([tweet('1', '2025-10-08T00:00:00Z'), tweet('2')], 'old-next')
    })
  )
  await writeFile(
    join(path, 'pages', '000002.json'),
    JSON.stringify({
      version: 1,
      scopeFingerprint,
      index: 2,
      sliceIndex: 0,
      query: 'list:123 since:2025-10-07 until:2025-10-10',
      requestCursor: 'old-next',
      response: page([tweet('3', '2025-10-06T00:00:00Z')])
    })
  )
  await writeFile(join(path, 'checkpoint.json'), JSON.stringify({ pages: 2 }))
}
const rows = async (path: string) =>
  (await readFile(join(path, 'posts.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

test('one fixed outer query traverses varying dates without resetting its cursor', async () => {
  const out = join(await root(), 'out')
  let index = 0
  const result = await runArchive({
    scope,
    out,
    delayMs: 0,
    search: async ({ since, until, cursor }) => {
      expect(since.format('YYYY-MM-DD')).toBe('2025-10-07')
      expect(until.add(1, 'day').format('YYYY-MM-DD')).toBe('2026-10-10')
      expect(cursor).toBe(index ? `next-${index}` : undefined)
      index++
      return page(
        [tweet(String(index), index === 1 ? '2026-10-07T23:00:00Z' : '2025-10-08T00:00:00Z')],
        index < 3 ? `next-${index}` : undefined
      )
    }
  })
  expect(result).toMatchObject({ complete: true, pages: 3, posts: 3 })
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({
    schema: 3,
    queryMode: 'single_range',
    coverageVerified: false,
    queryOldestTimestamp: '2025-10-08T00:00:00.000Z'
  })
  expect(manifest).not.toHaveProperty('days')
})

test('seed re-filters all legacy raw posts and fresh query duplicates do not trigger nonadvance', async () => {
  const parent = await root()
  const source = join(parent, 'source')
  const out = join(parent, 'out')
  await legacy(source)
  const original = await readFile(join(source, 'pages', '000001.json'), 'utf8')
  let index = 0
  const options = {
    scope,
    out,
    seedFrom: source,
    delayMs: 0,
    search: async ({ cursor }: { cursor?: string }) => {
      expect(cursor).toBe(index ? 'new-next' : undefined)
      index++
      return page(
        [tweet(index === 1 ? '2' : '1', index === 1 ? '2026-10-07T23:00:00Z' : '2025-10-08T00:00:00Z')],
        index === 1 ? 'new-next' : undefined
      )
    }
  }
  expect(await runArchive(options)).toMatchObject({ complete: true, pages: 2, posts: 2 })
  expect(await readFile(join(source, 'pages', '000001.json'), 'utf8')).toBe(original)
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({
    seedPages: 2,
    seedMatchedByQuery: 2,
    seedOnlyPosts: 0,
    queryOldestTimestamp: '2025-10-08T00:00:00.000Z',
    coverageVerified: false
  })
  expect((await rows(out)).map((row) => row.id).sort()).toEqual(['1', '2'])
})

test('seeded resume verifies self-contained snapshot after original source is removed', async () => {
  const parent = await root()
  const source = join(parent, 'source')
  const out = join(parent, 'out')
  await legacy(source)
  const options = {
    scope,
    out,
    seedFrom: source,
    delayMs: 0,
    maxPages: 1,
    search: async () => page([tweet('2')], 'next')
  }
  await runArchive(options)
  await rm(source, { recursive: true })
  expect(
    await runArchive({ scope, out, resume: true, delayMs: 0, search: async () => page([tweet('4')]) })
  ).toMatchObject({ complete: true, pages: 2, posts: 3 })
  expect((await rows(out)).map((row) => row.id).sort()).toEqual(['1', '2', '4'])
})

test('missing legacy page, scope mismatch, busy source and symlink source fail before any request', async () => {
  for (const failure of ['missing', 'scope', 'lock', 'symlink']) {
    const parent = await root()
    const source = join(parent, 'source')
    const out = join(parent, 'out')
    await legacy(source)
    let selected = source
    if (failure === 'missing') await rm(join(source, 'pages', '000002.json'))
    if (failure === 'lock') await writeFile(join(source, '.lock'), 'busy')
    if (failure === 'symlink') {
      selected = join(parent, 'link')
      await symlink(source, selected)
    }
    let requested = false
    const options = {
      scope: failure === 'scope' ? { ...scope, listId: '999' } : scope,
      out,
      seedFrom: selected,
      delayMs: 0,
      maxPages: 1,
      maxRequests: 1,
      search: async () => {
        requested = true
        return page([])
      }
    }
    await expect(runArchive(options)).rejects.toThrow()
    expect(requested).toBe(false)
    expect((await readdir(source)).sort()).toEqual(
      (failure === 'lock'
        ? ['.lock', 'checkpoint.json', 'pages', 'scope.json']
        : ['checkpoint.json', 'pages', 'scope.json']
      ).sort()
    )
  }
})

test('mutated or incomplete local seed snapshot fails closed on resume', async () => {
  for (const failure of ['mutated', 'incomplete']) {
    const parent = await root()
    const source = join(parent, 'source')
    const out = join(parent, 'out')
    await legacy(source)
    const options = {
      scope,
      out,
      seedFrom: source,
      maxPages: 1,
      delayMs: 0,
      search: async () => page([tweet('2')], 'next')
    }
    await runArchive(options)
    expect(await readdir(out)).toContain('seed')
    if (failure === 'mutated') await writeFile(join(out, 'seed', 'pages', '000001.json'), '{}')
    else await rm(join(out, 'seed', 'complete.json'))
    await expect(runArchive({ scope, out, resume: true, search: async () => page([]) })).rejects.toThrow()
  }
})

test('429 records only safe classification and remains resumable without automatic retry', async () => {
  const out = join(await root(), 'out')
  let calls = 0
  const result = await runArchive({
    scope,
    out,
    delayMs: 0,
    search: async () => {
      calls++
      throw Object.assign(new Error('secret-token'), { kind: 'rate_limited', status: 429 })
    }
  })
  expect(result).toMatchObject({ complete: false, reason: 'request_failed', pages: 0 })
  expect(calls).toBe(1)
  const manifest = await readFile(join(out, 'manifest.json'), 'utf8')
  expect(JSON.parse(manifest)).toMatchObject({ requestFailure: { kind: 'rate_limited', status: 429 } })
  expect(manifest).not.toContain('secret-token')
  expect(
    await runArchive({ scope, out, resume: true, delayMs: 0, search: async () => page([tweet('1')]) })
  ).toMatchObject({ complete: true, posts: 1 })
})

test('seed progress uses only fresh query time and counts seed pages separately', async () => {
  const parent = await root()
  const source = join(parent, 'source')
  const out = join(parent, 'out')
  await legacy(source)
  const snapshots: { date: string; pages: number; seedPages: number; posts: number }[] = []
  const options = {
    scope,
    out,
    seedFrom: source,
    delayMs: 0,
    onProgress: (value: { date: string; pages: number; seedPages: number; posts: number }) => {
      snapshots.push(value)
    },
    search: async () => page([tweet('2')])
  }
  await runArchive(options)
  expect(snapshots[0]).toMatchObject({ date: '-', pages: 0, seedPages: 2, posts: 2 })
  expect(snapshots.at(-1)).toMatchObject({ date: '2026-10-08', pages: 1, seedPages: 2, posts: 2 })
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({ seedMatchedByQuery: 1, seedOnlyPosts: 1 })
})

test('streamed normalized rows select last metadata without keeping every raw row in memory', async () => {
  const parent = await root()
  const source = join(parent, 'source')
  const out = join(parent, 'out')
  await legacy(source)
  const updated = tweet('1', '2025-10-08T00:00:00Z')
  updated.legacy.full_text = '最新版'
  const options = { scope, out, seedFrom: source, delayMs: 0, search: async () => page([updated, updated]) }
  expect(await runArchive(options)).toMatchObject({ complete: true, posts: 2 })
  const saved = await rows(out)
  expect(saved).toHaveLength(2)
  expect(saved.find((row) => row.id === '1')).toMatchObject({ text: '最新版', raw: updated })
})

test('seed CLI inherits fixed nonmidnight scope and rejects mismatches, nesting, aliases and resume combination', async () => {
  await mkdir(resolve('.cache'), { recursive: true })
  const parent = await mkdtemp(resolve('.cache/archive-seed-cli-'))
  roots.push(parent)
  const source = join(parent, 'source')
  const out = join(parent, 'out')
  await legacy(source)
  const invoke = (extra: string[]) =>
    spawnSync(
      process.execPath,
      ['--no-env-file', 'scripts/archive-list-posts.ts', '--dry-run', '--seed-from', source, '--out', out, ...extra],
      { encoding: 'utf8', env: { PATH: process.env.PATH } }
    )
  const inherited = invoke([])
  expect(inherited.status).toBe(0)
  expect(JSON.parse(inherited.stdout)).toMatchObject({ ...scope, query: 'list:123 since:2025-10-07 until:2026-10-10' })
  for (const extra of [
    ['--until', '2026-10-08'],
    ['--list-id', '999'],
    ['--resume'],
    ['--out', join(source, 'nested')],
    ['--out', join(source, '..output')]
  ]) {
    expect(invoke(extra).status).toBe(1)
  }
  const alias = join(parent, 'alias')
  await symlink(source, alias)
  expect(invoke(['--seed-from', alias]).status).toBe(1)
})

test('stream guard refuses a selected-row pointer whose journal payload changed after saving', async () => {
  const out = join(await root(), 'out')
  let changed = false
  const options = {
    scope,
    out,
    delayMs: 0,
    search: async () => page([tweet('1')]),
    onProgress: (value: { pages: number }) => {
      if (value.pages === 1 && !changed) {
        changed = true
        const path = join(out, 'pages', '000001.json')
        const envelope = JSON.parse(readFileSync(path, 'utf8'))
        envelope.response = page([tweet('2')])
        writeFileSync(path, JSON.stringify(envelope))
      }
    }
  }
  await expect(runArchive(options)).rejects.toMatchObject({ code: 'corrupt_journal' })
  expect(changed).toBe(true)
})

test('nested seed outputs including dot-dot names and aliases are rejected before creating any source child', async () => {
  for (const name of ['..output', 'nested', 'alias']) {
    const parent = await root()
    const source = join(parent, 'source')
    await legacy(source)
    const before = (await readdir(source)).sort()
    const alias = join(parent, 'alias')
    if (name === 'alias') await symlink(source, alias)
    const out = name === 'alias' ? join(alias, 'nested') : join(source, name)
    const options = { scope, out, seedFrom: source, delayMs: 0, maxPages: 1, search: async () => page([]) }
    await expect(runArchive(options)).rejects.toMatchObject({ code: 'invalid_params' })
    expect((await readdir(source)).sort()).toEqual(before)
  }
})

test('supported legacy safety-stop pages can seed their final raw posts but cannot have following pages', async () => {
  for (const kind of ['repeated_cursor', 'non_advancing']) {
    for (const following of [false, true]) {
      const parent = await root()
      const source = join(parent, 'source')
      const out = join(parent, 'out')
      await legacy(source)
      const first = JSON.parse(await readFile(join(source, 'pages', '000001.json'), 'utf8'))
      first.response = page([tweet('1', '2025-10-08T00:00:00Z')], 'old-next')
      await writeFile(join(source, 'pages', '000001.json'), JSON.stringify(first))
      const final = {
        ...first,
        index: 2,
        requestCursor: 'old-next',
        response:
          kind === 'repeated_cursor'
            ? page([tweet('2')], 'old-next')
            : page(
                [
                  {
                    ...tweet('1', '2025-10-08T00:00:00Z'),
                    legacy: { ...tweet('1').legacy, created_at: '2025-10-08T00:00:00Z', full_text: '更新済み' }
                  }
                ],
                'different'
              )
      }
      await writeFile(join(source, 'pages', '000002.json'), JSON.stringify(final))
      if (following)
        await writeFile(
          join(source, 'pages', '000003.json'),
          JSON.stringify({ ...final, index: 3, requestCursor: kind === 'repeated_cursor' ? 'old-next' : 'different' })
        )
      const options = { scope, out, seedFrom: source, delayMs: 0, search: async () => page([]) }
      if (following) await expect(runArchive(options)).rejects.toMatchObject({ code: 'corrupt_journal' })
      else {
        expect(await runArchive(options)).toMatchObject({ complete: true, posts: kind === 'repeated_cursor' ? 2 : 1 })
        if (kind === 'non_advancing') expect((await rows(out))[0].text).toBe('更新済み')
      }
    }
  }
})

test('second and resumed query pages containing only seed IDs still advance when new to the query', async () => {
  const parent = await root()
  const source = join(parent, 'source')
  const out = join(parent, 'out')
  await legacy(source)
  let calls = 0
  const options = {
    scope,
    out,
    seedFrom: source,
    maxPages: 2,
    delayMs: 0,
    search: async () => {
      calls++
      return page(
        [tweet(calls === 1 ? '2' : '1', calls === 1 ? '2026-10-07T23:00:00Z' : '2025-10-08T00:00:00Z')],
        `new-${calls}`
      )
    }
  }
  expect(await runArchive(options)).toMatchObject({ complete: false, reason: 'budget', pages: 2, posts: 2 })
  expect(
    await runArchive({
      scope,
      out,
      resume: true,
      delayMs: 0,
      search: async ({ cursor }) => {
        expect(cursor).toBe('new-2')
        calls++
        return page([tweet('4')])
      }
    })
  ).toMatchObject({ complete: true, pages: 3, posts: 3 })
  expect(calls).toBe(3)
  const resumedOut = join(parent, 'resumed')
  await runArchive({ ...options, out: resumedOut, maxPages: 1, search: async () => page([tweet('2')], 'first') })
  let resumedCalls = 0
  expect(
    await runArchive({
      scope,
      out: resumedOut,
      resume: true,
      delayMs: 0,
      search: async () => {
        resumedCalls++
        return resumedCalls === 1 ? page([tweet('1', '2025-10-08T00:00:00Z')], 'second') : page([tweet('4')])
      }
    })
  ).toMatchObject({ complete: true, pages: 3, posts: 3 })
  expect(resumedCalls).toBe(2)
})

test('progress can show a returned outside-window date while coverage oldest remains unset', async () => {
  const out = join(await root(), 'out')
  const snapshots: { date: string; posts: number }[] = []
  const options = {
    scope,
    out,
    delayMs: 0,
    search: async () => page([tweet('1', '2026-10-08T08:00:00Z')]),
    onProgress: (value: { date: string; posts: number }) => {
      snapshots.push(value)
    }
  }
  const result = await runArchive(options)
  expect(result).toMatchObject({ complete: true, posts: 0 })
  expect(result.queryOldestTimestamp).toBeUndefined()
  expect(snapshots.at(-1)).toMatchObject({ date: '2026-10-08', posts: 0 })
})
