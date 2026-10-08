import { afterEach, expect, spyOn, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runArchive } from '../scripts/lib/post-archive'

const scope = { listId: '123', from: '2025-01-01T00:00:00.000Z', until: '2026-10-08T00:00:00.000Z' }
const paths: string[] = []
afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })))
})
const output = async () => {
  const out = await fs.mkdtemp(join(tmpdir(), 'archive-index-'))
  paths.push(out)
  return out
}
const tweet = (id: string, handle = 'shop', authorId: string | undefined = '42', date = '2026-01-01T00:00:00Z') => ({
  __typename: 'Tweet',
  core: {
    user_results: {
      result: { ...(authorId ? { rest_id: authorId } : {}), core: { name: handle, screen_name: handle } }
    }
  },
  legacy: { id_str: id, created_at: date, full_text: handle, entities: { hashtags: [] } }
})
const page = (tweets: unknown[], cursor?: string) => ({
  data: {
    list: {
      tweets_timeline: {
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
const run = (
  out: string,
  search: (params: { cursor?: string }) => Promise<unknown>,
  options: Record<string, unknown> = {}
) =>
  runArchive({
    scope,
    source: 'list',
    out,
    search,
    maxPages: 1,
    delayMs: 0,
    ...options
  })
const lines = async (out: string) =>
  (await fs.readFile(join(out, 'posts.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

test('warm List resume reads no historical raw bodies and does not rewrite posts before its request', async () => {
  const out = await output()
  await run(out, async () => page([tweet('1')], 'next'))
  const stamp = await fs.stat(join(out, 'posts.jsonl'))
  const original = fs.readFile
  const reads: string[] = []
  const spy = spyOn(fs, 'readFile').mockImplementation(((...args: Parameters<typeof fs.readFile>) => {
    const path = String(args[0])
    if (path.startsWith(join(out, 'pages') + '/')) reads.push(path)
    return original(...args) as ReturnType<typeof fs.readFile>
  }) as typeof fs.readFile)
  try {
    await run(
      out,
      async ({ cursor }) => {
        expect(cursor).toBe('next')
        expect(reads).toEqual([])
        expect((await fs.stat(join(out, 'posts.jsonl'))).mtimeMs).toBe(stamp.mtimeMs)
        throw new Error('stop')
      },
      { resume: true }
    )
    expect(reads).toEqual([])
    expect((await fs.stat(join(out, 'posts.jsonl'))).mtimeMs).toBe(stamp.mtimeMs)
  } finally {
    spy.mockRestore()
  }
})

test('List index preserves duplicate order and legacy account rename semantics', async () => {
  const out = await output()
  let calls = 0
  await run(
    out,
    async () =>
      [
        page([tweet('1', 'Old'), tweet('2', 'Old'), tweet('3', 'Anon', '')], 'a'),
        page([tweet('1', 'New'), tweet('4', 'New', '77')])
      ][calls++],
    { maxPages: 2 }
  )
  expect((await lines(out)).map((post) => [post.id, post.author.screenName])).toEqual([
    ['2', 'Old'],
    ['3', 'Anon'],
    ['1', 'New'],
    ['4', 'New']
  ])
  const manifest = JSON.parse(await fs.readFile(join(out, 'manifest.json'), 'utf8'))
  expect(manifest.accounts).toEqual([
    { key: 'id:42', authorId: '42', screenName: 'new', posts: 2 },
    { key: 'handle:anon', screenName: 'anon', posts: 1 },
    { key: 'id:77', authorId: '77', screenName: 'new', posts: 1 }
  ])
})

test('cold migration and raw-before-index crash replay only the unapplied tail', async () => {
  const out = await output()
  await run(out, async () => page([tweet('1')], 'a'))
  await fs.rm(join(out, 'resume.sqlite'))
  await run(
    out,
    async ({ cursor }) => {
      expect(cursor).toBe('a')
      throw new Error('stop')
    },
    { resume: true }
  )
  const first = JSON.parse(await fs.readFile(join(out, 'pages/000001.json'), 'utf8'))
  await fs.writeFile(
    join(out, 'pages/000002.json'),
    JSON.stringify({ ...first, index: 2, requestCursor: 'a', response: page([tweet('2'), tweet('1', 'renamed')], 'b') })
  )
  const original = fs.readFile
  const reads: string[] = []
  const spy = spyOn(fs, 'readFile').mockImplementation(((...args: Parameters<typeof fs.readFile>) => {
    const path = String(args[0])
    if (path.startsWith(join(out, 'pages') + '/')) reads.push(path)
    return original(...args) as ReturnType<typeof fs.readFile>
  }) as typeof fs.readFile)
  try {
    const result = await run(
      out,
      async ({ cursor }) => {
        expect(cursor).toBe('b')
        throw new Error('stop')
      },
      { resume: true }
    )
    expect(result).toMatchObject({ pages: 2, posts: 2, reason: 'request_failed' })
    expect(reads).toEqual([join(out, 'pages/000002.json')])
  } finally {
    spy.mockRestore()
  }
  expect((await lines(out)).map((post) => [post.id, post.author.screenName])).toEqual([
    ['2', 'shop'],
    ['1', 'renamed']
  ])
})

test('cached deterministic List stop reasons prevent another request while runtime failure permits it', async () => {
  for (const [response, reason, terminalReason] of [
    [page([], undefined), 'list_exhausted', 'no_next_cursor'],
    [{ bad: true }, 'unsupported_payload', undefined]
  ] as const) {
    const out = await output()
    await run(out, async () => response)
    let calls = 0
    expect(
      await run(
        out,
        async () => {
          calls++
          return page([])
        },
        { resume: true }
      )
    ).toMatchObject({ reason, terminalReason })
    expect(calls).toBe(0)
  }
  const out = await output()
  let calls = 0
  await run(out, async () => page([tweet('1')], 'same'))
  await run(out, async () => page([tweet('2')], 'same'), { resume: true })
  expect(
    await run(
      out,
      async () => {
        calls++
        return page([])
      },
      { resume: true }
    )
  ).toMatchObject({ reason: 'repeated_cursor', pages: 2 })
  expect(calls).toBe(0)
})

test('invalid derived SQLite and missing or changed exports rebuild without changing journal bytes', async () => {
  const out = await output()
  await run(out, async () => page([tweet('1')]))
  const expected = await fs.readFile(join(out, 'posts.jsonl'), 'utf8')
  const journal = await fs.readFile(join(out, 'pages/000001.json'), 'utf8')
  await fs.writeFile(join(out, 'resume.sqlite'), 'not sqlite')
  await fs.writeFile(join(out, 'posts.jsonl'), 'damaged')
  expect(
    await run(
      out,
      async () => {
        throw new Error('must not request')
      },
      { resume: true }
    )
  ).toMatchObject({ reason: 'list_exhausted', posts: 1 })
  expect(await fs.readFile(join(out, 'posts.jsonl'), 'utf8')).toBe(expected)
  await fs.rm(join(out, 'posts.jsonl'))
  await run(
    out,
    async () => {
      throw new Error('must not request')
    },
    { resume: true }
  )
  expect(await fs.readFile(join(out, 'posts.jsonl'), 'utf8')).toBe(expected)
  expect(await fs.readFile(join(out, 'pages/000001.json'), 'utf8')).toBe(journal)
})

test('missing prefixes and checkpoint ahead stop before requests', async () => {
  for (const mutation of ['missing', 'gap', 'ahead', 'directory'] as const) {
    const out = await output()
    await run(out, async () => page([tweet('1')], 'a'))
    if (mutation === 'missing') await fs.rm(join(out, 'pages/000001.json'))
    if (mutation === 'gap') await fs.rename(join(out, 'pages/000001.json'), join(out, 'pages/000002.json'))
    if (mutation === 'ahead') {
      const checkpoint = JSON.parse(await fs.readFile(join(out, 'checkpoint.json'), 'utf8'))
      checkpoint.pages = 2
      await fs.writeFile(join(out, 'checkpoint.json'), JSON.stringify(checkpoint))
    }
    if (mutation === 'directory') {
      await fs.rm(join(out, 'pages/000001.json'))
      await fs.mkdir(join(out, 'pages/000001.json'))
    }
    let calls = 0
    await expect(
      run(
        out,
        async () => {
          calls++
          return page([])
        },
        { resume: true, verifyJournal: true }
      )
    ).rejects.toMatchObject({
      code: mutation === 'missing' || mutation === 'ahead' ? 'missing_journal' : 'corrupt_journal'
    })
    expect(calls).toBe(0)
  }
})

test('mtime-only changes hash just that page; changed content replays with the new latest projection', async () => {
  const out = await output()
  let calls = 0
  await run(out, async () => [page([tweet('1')], 'a'), page([tweet('2')])][calls++], { maxPages: 2 })
  const path = join(out, 'pages/000001.json')
  const original = fs.readFile
  const stat = await fs.stat(path)
  await fs.utimes(path, stat.atime, new Date(stat.mtimeMs + 1000))
  const reads: string[] = []
  const spy = spyOn(fs, 'readFile').mockImplementation(((...args: Parameters<typeof fs.readFile>) => {
    const path = String(args[0])
    if (path.startsWith(join(out, 'pages') + '/')) reads.push(path)
    return original(...args) as ReturnType<typeof fs.readFile>
  }) as typeof fs.readFile)
  try {
    await run(out, async () => page([]), { resume: true, verifyJournal: true })
    expect(reads).toEqual([path])
  } finally {
    spy.mockRestore()
  }
  const body = JSON.parse(await fs.readFile(path, 'utf8'))
  body.response = page([tweet('1', 'changed')], 'a')
  await fs.writeFile(path, JSON.stringify(body))
  await run(
    out,
    async () => {
      throw new Error('must not request')
    },
    { resume: true, verifyJournal: true }
  )
  expect((await lines(out)).map((post) => post.text)).toEqual(['changed', 'shop'])
})

test('allHistory policy changes invalidate cached filtering and occurrence timestamps remain complete', async () => {
  const out = await output()
  await run(out, async () => page([tweet('1'), tweet('2', 'old', '42', '2020-01-01T00:00:00Z')]))
  expect((await lines(out)).map((post) => post.id)).toEqual(['1'])
  await run(
    out,
    async () => {
      throw new Error('must not request')
    },
    { resume: true, allHistory: true, verifyJournal: true }
  )
  expect((await lines(out)).map((post) => post.id)).toEqual(['1', '2'])
  expect(JSON.parse(await fs.readFile(join(out, 'manifest.json'), 'utf8'))).toMatchObject({
    outsideWindow: 0,
    minTimestamp: '2020-01-01T00:00:00.000Z'
  })
  await run(out, async () => page([]), { resume: true, allHistory: false, verifyJournal: true })
  expect((await lines(out)).map((post) => post.id)).toEqual(['1'])
})

test('failed dependency and deadline pages count but discard partial data and retry the same cursor after warm resume', async () => {
  const dependency = {
    data: { list: { tweets_timeline: {} } },
    errors: [
      {
        kind: 'Operational',
        name: 'DependencyError',
        source: 'Server',
        extensions: { kind: 'Operational', name: 'DependencyError', source: 'Server' },
        path: ['list', 'tweets_timeline', 'timeline']
      }
    ]
  }
  const partial = tweet('99', 'old', '42', '2000-01-01T00:00:00Z')
  Reflect.set(partial.core.user_results.result, 'profile_metadata', null)
  const deadline = {
    ...page([partial], 'discarded'),
    errors: [
      {
        kind: 'ServiceLevel',
        name: 'DeadlineExceeded',
        source: 'Server',
        extensions: { kind: 'ServiceLevel', name: 'DeadlineExceeded', source: 'Server' },
        path: [
          'list',
          'tweets_timeline',
          'timeline',
          'instructions',
          0,
          'entries',
          0,
          'content',
          'itemContent',
          'tweet_results',
          'result',
          'core',
          'user_results',
          'result',
          'profile_metadata'
        ]
      }
    ]
  }
  for (const failure of [dependency, deadline]) {
    const out = await output()
    let calls = 0
    await run(out, async () => [page([tweet('1')], 'a'), failure][calls++], { maxPages: 2, retry: false })
    expect((await lines(out)).map((post) => post.id)).toEqual(['1'])
    expect(
      await run(
        out,
        async ({ cursor }) => {
          expect(cursor).toBe('a')
          return page([tweet('2')])
        },
        { resume: true }
      )
    ).toMatchObject({
      pages: 3,
      posts: 2,
      reason: 'list_exhausted',
      topLevelOldestTimestamp: '2026-01-01T00:00:00.000Z'
    })
  }
})

test('a new retryable failure with no adopted posts keeps the existing JSONL export', async () => {
  const out = await output()
  await run(out, async () => page([tweet('1')], 'next'))
  const before = await fs.stat(join(out, 'posts.jsonl'), { bigint: true })
  const dependency = {
    data: { list: { tweets_timeline: {} } },
    errors: [
      {
        kind: 'Operational',
        name: 'DependencyError',
        source: 'Server',
        extensions: { kind: 'Operational', name: 'DependencyError', source: 'Server' },
        path: ['list', 'tweets_timeline', 'timeline']
      }
    ]
  }
  expect(await run(out, async () => dependency, { resume: true, retry: false })).toMatchObject({
    pages: 2,
    posts: 1,
    reason: 'request_failed'
  })
  const after = await fs.stat(join(out, 'posts.jsonl'), { bigint: true })
  expect(after.ino).toBe(before.ino)
  expect(after.mtimeNs).toBe(before.mtimeNs)
})

test('HF-style hardlink snapshots do not cause historical body reads on warm resume', async () => {
  const out = await output()
  await run(out, async () => page([tweet('1')], 'next'))
  await fs.link(join(out, 'pages/000001.json'), join(out, 'snapshot-page.json'))
  const original = fs.readFile
  const reads: string[] = []
  const spy = spyOn(fs, 'readFile').mockImplementation(((...args: Parameters<typeof fs.readFile>) => {
    const path = String(args[0])
    if (path.startsWith(join(out, 'pages') + '/')) reads.push(path)
    return original(...args) as ReturnType<typeof fs.readFile>
  }) as typeof fs.readFile)
  try {
    await run(
      out,
      async () => {
        throw new Error('stop')
      },
      { resume: true }
    )
    expect(reads).toEqual([])
  } finally {
    spy.mockRestore()
  }
})

test('observed empty List over-capacity errors retry the same cursor and reject ambiguous variants', async () => {
  const failure = {
    data: { list: { tweets_timeline: {} } },
    errors: [
      {
        kind: 'ServiceLevel',
        name: 'DownstreamOverCapacityError',
        source: 'Server',
        extensions: { kind: 'ServiceLevel', name: 'DownstreamOverCapacityError', source: 'Server' },
        path: ['list', 'tweets_timeline', 'timeline']
      }
    ]
  }
  const out = await output()
  await run(out, async () => page([tweet('1')], 'next'))
  let calls = 0
  expect(
    await run(
      out,
      async ({ cursor }) => {
        expect(cursor).toBe('next')
        return calls++ === 0 ? failure : page([tweet('2')])
      },
      { resume: true, maxPages: 2, retryDelayMs: 0, maxRetryDelayMs: 0 }
    )
  ).toMatchObject({
    pages: 3,
    posts: 2,
    reason: 'list_exhausted',
    retriesThisRun: 1
  })
  expect(calls).toBe(2)
  for (const mutate of [
    (value: typeof failure) => {
      value.errors[0].kind = 'Operational'
      value.errors[0].extensions.kind = 'Operational'
    },
    (value: typeof failure) => {
      value.errors[0].extensions.name = 'DependencyError'
    },
    (value: typeof failure) => {
      value.errors.push(structuredClone(value.errors[0]))
    },
    (value: typeof failure) => {
      Reflect.set(value.data.list.tweets_timeline, 'timeline', {})
    },
    (value: typeof failure) => {
      Reflect.set(value, 'unrecognized', true)
    },
    (value: typeof failure) => {
      value.errors[0].source = 'Client'
      value.errors[0].extensions.source = 'Client'
    }
  ]) {
    const invalid = structuredClone(failure)
    mutate(invalid)
    const invalidOut = await output()
    expect(await run(invalidOut, async () => invalid)).toMatchObject({
      reason: 'unsupported_payload',
      pages: 1,
      posts: 0
    })
  }
})

test('default warm resume checks only its frontier without listing or counting the saved prefix', async () => {
  const out = await output()
  let pageNumber = 0
  await run(
    out,
    async () => {
      pageNumber++
      return page([tweet(String(pageNumber))], `cursor-${pageNumber}`)
    },
    { maxPages: 1000 }
  )
  const { Database } = await import('bun:sqlite')
  const originalQuery = Database.prototype.query
  const queries: string[] = []
  const querySpy = spyOn(Database.prototype, 'query').mockImplementation(function (
    this: InstanceType<typeof Database>,
    ...args: Parameters<typeof originalQuery>
  ) {
    queries.push(String(args[0]))
    return originalQuery.apply(this, args)
  } as typeof originalQuery)
  const originalReadDir = fs.readdir
  const directories: string[] = []
  const dirSpy = spyOn(fs, 'readdir').mockImplementation(((...args: Parameters<typeof fs.readdir>) => {
    directories.push(String(args[0]))
    return originalReadDir(...args)
  }) as typeof fs.readdir)
  const originalLstat = fs.lstat
  const pageStats: string[] = []
  const statSpy = spyOn(fs, 'lstat').mockImplementation(((...args: Parameters<typeof fs.lstat>) => {
    if (String(args[0]).startsWith(join(out, 'pages') + '/')) pageStats.push(String(args[0]))
    return originalLstat(...args)
  }) as typeof fs.lstat)
  try {
    const result = await run(
      out,
      async ({ cursor }) => {
        expect(cursor).toBe('cursor-1000')
        throw new Error('stop')
      },
      { resume: true }
    )
    expect(result).toMatchObject({ pages: 1000, posts: 1000 })
    expect(directories).not.toContain(join(out, 'pages'))
    expect(pageStats).toEqual([join(out, 'pages/001000.json'), join(out, 'pages/001001.json')])
    expect(queries.filter((sql) => /count\s*\(\s*\*|FROM pages ORDER BY/i.test(sql))).toEqual([])
  } finally {
    querySpy.mockRestore()
    dirSpy.mockRestore()
    statSpy.mockRestore()
  }
}, 20000)

const metadata = async (out: string, change?: (value: Record<string, unknown>) => void) => {
  const { Database } = await import('bun:sqlite')
  const db = new Database(join(out, 'resume.sqlite'))
  try {
    const value = JSON.parse((db.query('SELECT json FROM metadata WHERE id=1').get() as { json: string }).json)
    if (change) {
      change(value)
      db.query('UPDATE metadata SET json=? WHERE id=1').run(JSON.stringify(value))
    }
    return value
  } finally {
    db.close()
  }
}
const upgrade = async (out: string, from: string, to: string) => {
  const { createHash } = await import('node:crypto')
  const checkpoint = JSON.parse(await fs.readFile(join(out, 'checkpoint.json'), 'utf8'))
  const context = {
    fingerprint: checkpoint.scopeFingerprint,
    source: 'list',
    allHistory: false,
    from: scope.from,
    until: scope.until
  }
  return {
    version: 1,
    from,
    to,
    context: createHash('sha256').update(JSON.stringify(context)).digest('hex'),
    bunVersion: process.versions.bun,
    schemaVersion: 1,
    oldSourceSha256: { core: 'a'.repeat(64), index: 'b'.repeat(64) }
  }
}

test('an exact upgrade bridge promotes only the cache key and its committed retry is idempotent', async () => {
  const out = await output()
  await run(out, async () => page([tweet('1')], 'next'))
  const before = await metadata(out)
  const stamp = await fs.stat(join(out, 'posts.jsonl'))
  const old = '1'.repeat(64)
  await metadata(out, (value) => {
    value.key = old
  })
  const bridge = await upgrade(out, old, before.key)
  const bridgePath = join(out, 'resume-upgrade.json')
  await fs.writeFile(bridgePath, JSON.stringify(bridge))
  const result = await run(
    out,
    async ({ cursor }) => {
      expect(cursor).toBe('next')
      throw new Error('stop')
    },
    { resume: true }
  )
  expect(result).toMatchObject({ pages: 1, posts: 1 })
  expect(await metadata(out)).toEqual(before)
  expect((await fs.stat(join(out, 'posts.jsonl'))).mtimeMs).toBe(stamp.mtimeMs)
  await expect(fs.stat(bridgePath)).rejects.toMatchObject({ code: 'ENOENT' })
  await fs.writeFile(bridgePath, JSON.stringify(bridge))
  await run(
    out,
    async () => {
      throw new Error('stop')
    },
    { resume: true }
  )
  expect(await metadata(out)).toEqual(before)
  await expect(fs.stat(bridgePath)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('missing, malformed and mismatched upgrade bridges preserve an incompatible index', async () => {
  for (const variant of ['absent', 'malformed', 'from', 'to', 'context', 'bun', 'schema'] as const) {
    const out = await output()
    await run(out, async () => page([tweet('1')], 'next'))
    const target = (await metadata(out)).key
    const old = '1'.repeat(64)
    await metadata(out, (value) => {
      value.key = old
    })
    const before = await metadata(out)
    const bridge = await upgrade(out, old, target)
    if (variant === 'from') bridge.from = '2'.repeat(64)
    if (variant === 'to') bridge.to = '2'.repeat(64)
    if (variant === 'context') bridge.context = '2'.repeat(64)
    if (variant === 'bun') bridge.bunVersion = '0.0.0'
    if (variant === 'schema') bridge.schemaVersion = 99
    if (variant !== 'absent')
      await fs.writeFile(join(out, 'resume-upgrade.json'), variant === 'malformed' ? '{' : JSON.stringify(bridge))
    let calls = 0
    await expect(
      run(
        out,
        async () => {
          calls++
          return page([])
        },
        { resume: true }
      )
    ).rejects.toMatchObject({ code: 'index_incompatible' })
    expect(calls).toBe(0)
    expect(await metadata(out)).toEqual(before)
    expect((await lines(out)).map((post) => post.id)).toEqual(['1'])
  }
})

test('explicit full verification rebuilds an incompatible key and detects older count and prefix damage', async () => {
  const out = await output()
  let calls = 0
  await run(out, async () => [page([tweet('1')], 'a'), page([tweet('2')], 'b')][calls++], { maxPages: 2 })
  const correct = await metadata(out)
  await metadata(out, (value) => {
    value.key = '1'.repeat(64)
    value.count = 999
  })
  await run(
    out,
    async () => {
      throw new Error('stop')
    },
    { resume: true, verifyJournal: true }
  )
  expect((await metadata(out)).key).toBe(correct.key)
  expect((await metadata(out)).count).toBe(2)
  await fs.rm(join(out, 'pages/000001.json'))
  await expect(
    run(
      out,
      async () => {
        throw new Error('must not request')
      },
      { resume: true, verifyJournal: true }
    )
  ).rejects.toMatchObject({ code: 'missing_journal' })
})

test('default resume refuses a missing or changed frontier and an indexed terminal with unapplied tail', async () => {
  for (const variant of ['missing', 'changed', 'terminal', 'ahead'] as const) {
    const out = await output()
    await run(out, async () => page([tweet('1')], variant === 'terminal' ? undefined : 'a'))
    if (variant === 'missing') await fs.rm(join(out, 'pages/000001.json'))
    if (variant === 'changed') {
      const envelope = JSON.parse(await fs.readFile(join(out, 'pages/000001.json'), 'utf8'))
      envelope.response = page([tweet('1', 'changed')], 'a')
      await fs.writeFile(join(out, 'pages/000001.json'), JSON.stringify(envelope))
    }
    if (variant === 'terminal') {
      const envelope = JSON.parse(await fs.readFile(join(out, 'pages/000001.json'), 'utf8'))
      await fs.writeFile(
        join(out, 'pages/000002.json'),
        JSON.stringify({ ...envelope, index: 2, response: page([tweet('2')]) })
      )
    }
    if (variant === 'ahead') {
      const checkpoint = JSON.parse(await fs.readFile(join(out, 'checkpoint.json'), 'utf8'))
      checkpoint.pages = 2
      await fs.writeFile(join(out, 'checkpoint.json'), JSON.stringify(checkpoint))
    }
    let calls = 0
    await expect(
      run(
        out,
        async () => {
          calls++
          return page([])
        },
        { resume: true }
      )
    ).rejects.toMatchObject({
      code: variant === 'missing' || variant === 'ahead' ? 'missing_journal' : 'corrupt_journal'
    })
    expect(calls).toBe(0)
  }
})
