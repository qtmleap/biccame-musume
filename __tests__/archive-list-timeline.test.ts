import { afterEach, expect, spyOn, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArchivePage, runArchive } from '../scripts/lib/post-archive'
import { Client } from '../workers/bot/src/timeline/client'
import { TimelineFailure } from '../workers/bot/src/timeline/utils/failure'

const scope = {
  listId: '2019028800869413128',
  from: '2026-10-07T15:00:00.000Z',
  until: '2026-10-08T03:45:12.345Z'
}
const endpoint = '/i/api/graphql/1LE3u14FJjPZUHKFGzos2g/ListLatestTweetsTimeline'
const paths: string[] = []
afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const output = async () => {
  const path = await mkdtemp(join(tmpdir(), 'list-timeline-archive-'))
  paths.push(path)
  return path
}
const tweet = (id: string, createdAt = '2026-10-07T23:00:00Z') => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: { rest_id: '42', core: { name: '店', screen_name: 'bic_test' } } } },
  legacy: {
    id_str: id,
    created_at: createdAt,
    full_text: '通常のお知らせ #テスト',
    in_reply_to_status_id_str: '100',
    in_reply_to_user_id_str: '41',
    entities: { hashtags: [{ text: 'テスト' }] },
    retweeted_status_result: { result: { rest_id: '900', opaque: 'preserved original RT' } }
  }
})
const item = (result: unknown) => ({ itemContent: { itemType: 'TimelineTweet', tweet_results: { result } } })
const listInstructions = (instructions: unknown[]) => ({
  data: { list: { tweets_timeline: { timeline: { instructions } } } },
  opaque: { preserved: true }
})
const page = (tweets: unknown[], cursor?: string) =>
  listInstructions([
    {
      type: 'TimelineAddEntries',
      entries: [
        ...tweets.map((result, index) => ({ entryId: `tweet-${index}`, content: item(result) })),
        ...(cursor ? [{ content: { cursorType: 'Bottom', value: cursor } }] : [])
      ]
    }
  ])
const searchPage = () => ({
  data: {
    search_by_raw_query: {
      search_timeline: { timeline: { instructions: [{ type: 'TimelineAddEntries', entries: [] }] } }
    }
  }
})
const dependencyError = () => ({
  data: { list: { tweets_timeline: {} } },
  errors: [
    {
      extensions: { kind: 'Operational', name: 'DependencyError', source: 'Server' },
      kind: 'Operational',
      locations: [{ column: 7, line: 4 }],
      message: 'Dependency: Unspecified',
      name: 'DependencyError',
      path: ['list', 'tweets_timeline', 'timeline'],
      source: 'Server'
    }
  ]
})
const replacementCursors = (cursor: string) =>
  listInstructions(
    ['Top', 'Bottom'].map((cursorType) => {
      const entryId = cursorType === 'Top' ? 'cursor-top-9223372036854775807' : 'cursor-bottom-0'
      return {
        type: 'TimelineReplaceEntry',
        entry_id_to_replace: entryId,
        entry: {
          entryId,
          content: {
            __typename: 'TimelineTimelineCursor',
            entryType: 'TimelineTimelineCursor',
            cursorType,
            value: cursorType === 'Top' ? 'top' : cursor
          }
        }
      }
    })
  )
const rows = async (out: string): Promise<Record<string, unknown>[]> => {
  const text = await readFile(join(out, 'posts.jsonl'), 'utf8')
  return text.trim()
    ? text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : []
}

test('native List conversations retain reply, visibility and retweet metadata', () => {
  const reply = {
    __typename: 'TweetWithVisibilityResults',
    visibilityResults: { reason: 'preserved' },
    tweet: { ...tweet('2'), note_tweet: { note_tweet_results: { result: { text: '長い返信' } } } }
  }
  const response = listInstructions([
    {
      type: 'TimelineAddEntries',
      entries: [{ content: { items: [{ item: item(tweet('1')) }, { item: item(reply) }] } }]
    }
  ])
  const parsed = parseArchivePage(response, 'list')
  expect(parsed.posts.map((post) => post.id)).toEqual(['1', '2'])
  expect(parsed.posts[0].raw).toEqual(tweet('1'))
  expect(parsed.posts[1]).toMatchObject({ text: '長い返信', replyToStatusId: '100', raw: reply })
  expect(parsed.nextCursor).toBeUndefined()
})

test('raw List request uses the signed endpoint and List variables without date search', async () => {
  const requests: Request[] = []
  const signatures: [string, string][] = []
  const raw = { metadata: 'HTTP-200 raw body must survive validation', errors: [{ code: 99 }] }
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init))
        return Response.json(raw)
      },
      { preconnect: () => {} }
    )
  )
  try {
    const client = new Client(
      { TWITTER_BEARER_TOKEN: 'test-bearer', TWITTER_AUTH_TOKEN: 'test-auth', TWITTER_CSRF_TOKEN: 'test-csrf' },
      async () => ({
        generateTransactionId: async (method, path) => {
          signatures.push([method, path])
          return 'list-signature'
        }
      })
    )
    expect(typeof client.listRaw).toBe('function')
    expect(await client.listRaw({ listId: '123456', cursor: 'next-list' })).toEqual(raw)
    expect(requests).toHaveLength(1)
    const url = new URL(requests[0].url)
    expect(url.pathname).toBe(endpoint)
    expect(JSON.parse(String(url.searchParams.get('variables')))).toEqual({
      listId: '123456',
      count: 20,
      cursor: 'next-list'
    })
    expect(requests[0].headers.get('x-client-transaction-id')).toBe('list-signature')
    expect(requests[0].headers.get('x-csrf-token')).toBe('test-csrf')
    expect(signatures).toEqual([['GET', endpoint]])
  } finally {
    fetchSpy.mockRestore()
  }
})

test('List client rejects invalid list IDs and reports HTTP429 without leaking response secrets', async () => {
  let requests = 0
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async () => {
        requests++
        return new Response('auth_token=secret-response', { status: 429 })
      },
      { preconnect: () => {} }
    )
  )
  try {
    const client = new Client(
      { TWITTER_BEARER_TOKEN: 'test', TWITTER_AUTH_TOKEN: 'test', TWITTER_CSRF_TOKEN: 'test' },
      async () => ({ generateTransactionId: async () => 'signed' })
    )
    expect(typeof client.listRaw).toBe('function')
    await expect(client.listRaw({ listId: '123 OR filter:links' })).rejects.toThrow()
    expect(requests).toBe(0)
    const failure = await client.listRaw({ listId: '123' }).catch((error: unknown) => error)
    expect(failure).toMatchObject({ kind: 'rate_limited', status: 429 })
    expect(String(failure)).not.toContain('secret-response')
    expect(requests).toBe(1)
  } finally {
    fetchSpy.mockRestore()
  }
})

test('List follows old conversation parents and empty pages with cursors before local date filtering', async () => {
  const out = await output()
  let index = 0
  const options = {
    source: 'list' as const,
    scope,
    out,
    delayMs: 0,
    search: async ({ cursor, listId }: { cursor?: string; listId: string }) => {
      expect(listId).toBe(scope.listId)
      expect(cursor).toBe([undefined, 'A', 'B'][index])
      return [
        page([tweet('100', '2020-01-01T00:00:00Z'), tweet('1')], 'A'),
        page([], 'B'),
        page([tweet('1'), tweet('2')])
      ][index++]
    }
  }
  const result = await runArchive(options)
  expect(result).toMatchObject({
    complete: true,
    reason: 'list_exhausted',
    pages: 3,
    posts: 2,
    coverageVerified: false
  })
  expect((await rows(out)).map((row) => row.id)).toEqual(['1', '2'])
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({ queryMode: 'list_timeline', endpoint, outsideWindow: 1, coverageVerified: false })
  expect(manifest.query).not.toContain('since:')
})

test('List continues three advancing cursor-only pairs and duplicate context pages until fresh posts', async () => {
  const out = await output()
  let index = 0
  const options = {
    source: 'list' as const,
    scope,
    out,
    delayMs: 0,
    search: async () =>
      [
        page([tweet('1')], 'A'),
        replacementCursors('B'),
        replacementCursors('C'),
        replacementCursors('D'),
        page([tweet('1')], 'E'),
        page([tweet('2')])
      ][index++]
  }
  expect(await runArchive(options)).toMatchObject({ complete: true, reason: 'list_exhausted', pages: 6, posts: 2 })
  expect((await rows(out)).map((row) => row.id)).toEqual(['1', '2'])
})

test('List progress ignores conversation parent dates but retains top-level dates and all raw date bounds', async () => {
  const out = await output()
  const snapshots: { date: string; pages: number; posts: number; status: string }[] = []
  let index = 0
  const conversation = listInstructions([
    {
      type: 'TimelineAddEntries',
      entries: [
        {
          content: {
            items: [{ item: item(tweet('100', '2020-01-01T00:00:00Z')) }, { item: item(tweet('1')) }]
          }
        },
        { content: { cursorType: 'Bottom', value: 'A' } }
      ]
    }
  ])
  const options = {
    source: 'list' as const,
    scope,
    out,
    delayMs: 0,
    onProgress: (snapshot: { date: string; pages: number; posts: number; status: string }) => {
      snapshots.push(snapshot)
    },
    search: async () => [conversation, page([tweet('2')], 'B'), page([], undefined)][index++]
  }
  expect(await runArchive(options)).toMatchObject({
    complete: true,
    pages: 3,
    posts: 2,
    topLevelOldestTimestamp: '2026-10-07T23:00:00.000Z'
  })
  expect(snapshots.find((snapshot) => snapshot.pages === 1)).toMatchObject({ date: '-', posts: 1 })
  expect(snapshots.at(-1)).toMatchObject({ date: '2026-10-08', posts: 2, status: 'list_exhausted' })
  expect(JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')).minTimestamp).toBe('2020-01-01T00:00:00.000Z')
  expect(JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')).topLevelOldestTimestamp).toBe(
    '2026-10-07T23:00:00.000Z'
  )
})

test('Search schema3 scope keeps the exact existing byte format', async () => {
  const out = await output()
  await runArchive({ scope, out, delayMs: 0, search: async () => searchPage() })
  expect(await readFile(join(out, 'scope.json'), 'utf8')).toBe(
    '{"schema":3,"queryVersion":1,"queryMode":"single_range","product":"Latest","count":20,"exhaustionPolicy":{"version":1,"consecutiveReplacementPairs":3},"listId":"2019028800869413128","from":"2026-10-07T15:00:00.000Z","until":"2026-10-08T03:45:12.345Z","query":"list:2019028800869413128 since:2026-10-07 until:2026-10-10"}'
  )
})

test('List budget and replay preserve the cursor, immutable journal and ID deduplication', async () => {
  const out = await output()
  const first = {
    source: 'list' as const,
    scope,
    out,
    maxPages: 1,
    delayMs: 0,
    search: async () => page([tweet('1')], 'resume-list')
  }
  expect(await runArchive(first)).toMatchObject({ complete: false, reason: 'budget', pages: 1, posts: 1 })
  const scopeBytes = await readFile(join(out, 'scope.json'), 'utf8')
  const pageBytes = await readFile(join(out, 'pages', '000001.json'), 'utf8')
  const resumed = {
    source: 'list' as const,
    scope,
    out,
    resume: true,
    delayMs: 0,
    search: async ({ cursor }: { cursor?: string }) => {
      expect(cursor).toBe('resume-list')
      return page([tweet('1'), tweet('2')])
    }
  }
  expect(await runArchive(resumed)).toMatchObject({ complete: true, reason: 'list_exhausted', pages: 2, posts: 2 })
  expect((await rows(out)).map((row) => row.id)).toEqual(['1', '2'])
  expect(await readFile(join(out, 'scope.json'), 'utf8')).toBe(scopeBytes)
  expect(await readFile(join(out, 'pages', '000001.json'), 'utf8')).toBe(pageBytes)
})

test('List and Search reject each other’s saved source before making any resumed request', async () => {
  for (const source of ['list', 'search'] as const) {
    const out = await output()
    const first = { source, scope, out, delayMs: 0, search: async () => (source === 'list' ? page([]) : searchPage()) }
    await runArchive(first)
    let calls = 0
    const resumed = {
      source: source === 'list' ? ('search' as const) : ('list' as const),
      scope,
      out,
      resume: true,
      delayMs: 0,
      search: async () => {
        calls++
        return searchPage()
      }
    }
    await expect(runArchive(resumed)).rejects.toMatchObject({ code: 'scope_mismatch' })
    expect(calls).toBe(0)
  }
})

test('resume dry-run rejects another source’s cache while resolving its own saved scope', async () => {
  for (const source of ['list', 'search'] as const) {
    const root = await output()
    const out = join(root, '.cache', 'out')
    const first = { source, scope, out, delayMs: 0, search: async () => (source === 'list' ? page([]) : searchPage()) }
    await runArchive(first)
    for (const target of ['list', 'search'] as const) {
      const script = join(
        process.cwd(),
        'scripts',
        target === 'list' ? 'archive-list-timeline.ts' : 'archive-list-posts.ts'
      )
      const result = spawnSync(
        process.execPath,
        ['--no-env-file', script, '--resume', '--dry-run', '--out', '.cache/out'],
        {
          cwd: root,
          env: { PATH: process.env.PATH },
          encoding: 'utf8'
        }
      )
      expect(result.status).toBe(source === target ? 0 : 1)
      if (source !== target) expect(result.stderr).toContain('scope_mismatch')
      else expect(JSON.parse(result.stdout)).toMatchObject(scope)
    }
  }
})

test('List saves unsupported raw bodies before parsing and preserves partial data on HTTP429', async () => {
  const malformedOut = await output()
  const raw = { data: { list: { unexpected: true } }, metadata: 'kept' }
  const malformed = { source: 'list' as const, scope, out: malformedOut, delayMs: 0, search: async () => raw }
  expect(await runArchive(malformed)).toMatchObject({ complete: false, reason: 'unsupported_payload', pages: 1 })
  expect(JSON.parse(await readFile(join(malformedOut, 'pages', '000001.json'), 'utf8')).response).toEqual(raw)

  const out = await output()
  let calls = 0
  const options = {
    source: 'list' as const,
    scope,
    out,
    delayMs: 0,
    search: async () => {
      if (calls++) throw new TimelineFailure('rate_limited', 429)
      return page([tweet('1')], 'preserved-cursor')
    }
  }
  expect(await runArchive(options)).toMatchObject({
    complete: false,
    reason: 'request_failed',
    pages: 1,
    posts: 1,
    requestFailure: { kind: 'rate_limited', status: 429 }
  })
  expect(JSON.parse(await readFile(join(out, 'checkpoint.json'), 'utf8')).nextCursor).toBe('preserved-cursor')
  expect((await rows(out)).map((row) => row.id)).toEqual(['1'])
})

test('List DependencyError stops the run without retrying and preserves its failed request cursor', async () => {
  for (const withPriorPage of [false, true]) {
    const out = await output()
    const responses = withPriorPage ? [page([tweet('1')], 'failed-cursor'), dependencyError()] : [dependencyError()]
    let calls = 0
    const result = await runArchive({
      source: 'list',
      scope,
      out,
      delayMs: 0,
      search: async ({ cursor }) => {
        expect(cursor).toBe(calls ? 'failed-cursor' : undefined)
        return responses[calls++]
      }
    })
    expect(result).toMatchObject({
      complete: false,
      reason: 'request_failed',
      pages: responses.length,
      posts: withPriorPage ? 1 : 0,
      requestFailure: { kind: 'list_dependency' }
    })
    expect(result.requestFailure).not.toHaveProperty('status')
    expect(calls).toBe(responses.length)
    expect(JSON.parse(await readFile(join(out, 'checkpoint.json'), 'utf8')).nextCursor).toBe(
      withPriorPage ? 'failed-cursor' : undefined
    )
    expect(
      JSON.parse(await readFile(join(out, 'pages', `${String(responses.length).padStart(6, '0')}.json`), 'utf8'))
        .response
    ).toEqual(dependencyError())
    expect((await rows(out)).map((row) => row.id)).toEqual(withPriorPage ? ['1'] : [])
    expect(await readFile(join(out, 'manifest.json'), 'utf8')).not.toContain('Dependency: Unspecified')
  }
})

test('List resume appends recovery at the same cursor and replays the recovered chain without rewriting journal bytes', async () => {
  const out = await output()
  let initialCalls = 0
  await runArchive({
    source: 'list',
    scope,
    out,
    delayMs: 0,
    search: async () => (initialCalls++ === 0 ? page([tweet('1')], 'failed-cursor') : dependencyError())
  })
  const originalFiles = ['scope.json', 'pages/000001.json', 'pages/000002.json']
  const originalBytes = await Promise.all(originalFiles.map((path) => readFile(join(out, path), 'utf8')))
  let resumedCalls = 0
  const recovered = await runArchive({
    source: 'list',
    scope,
    out,
    resume: true,
    maxRequests: 1,
    delayMs: 0,
    search: async ({ cursor }) => {
      resumedCalls++
      expect(cursor).toBe('failed-cursor')
      return page([tweet('1'), tweet('2')], 'recovered-cursor')
    }
  })
  expect(recovered).toMatchObject({ complete: false, reason: 'budget', pages: 3, posts: 2 })
  expect(recovered.requestFailure).toBeUndefined()
  expect(JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')).requestFailure).toBeUndefined()
  expect(resumedCalls).toBe(1)
  expect(await Promise.all(originalFiles.map((path) => readFile(join(out, path), 'utf8')))).toEqual(originalBytes)
  const recoveryEnvelope = JSON.parse(await readFile(join(out, 'pages', '000003.json'), 'utf8'))
  expect(recoveryEnvelope).toMatchObject({ index: 3, requestCursor: 'failed-cursor' })
  expect(recoveryEnvelope.scopeFingerprint).toBe(JSON.parse(originalBytes[1]).scopeFingerprint)
  expect((await rows(out)).map((row) => row.id)).toEqual(['1', '2'])
  const continued = await runArchive({
    source: 'list',
    scope,
    out,
    resume: true,
    delayMs: 0,
    search: async ({ cursor }) => {
      expect(cursor).toBe('recovered-cursor')
      return page([tweet('3')])
    }
  })
  expect(continued).toMatchObject({ complete: true, reason: 'list_exhausted', pages: 4, posts: 3 })
  expect((await rows(out)).map((row) => row.id)).toEqual(['1', '2', '3'])
  expect(await Promise.all(originalFiles.map((path) => readFile(join(out, path), 'utf8')))).toEqual(originalBytes)
})

test('each explicit List resume appends one repeated DependencyError and stops before another request', async () => {
  const out = await output()
  await runArchive({
    source: 'list',
    scope,
    out,
    maxPages: 1,
    delayMs: 0,
    search: async () => page([tweet('1')], 'failed-cursor')
  })
  for (const index of [2, 3, 4]) {
    let calls = 0
    const result = await runArchive({
      source: 'list',
      scope,
      out,
      resume: true,
      maxRequests: 1,
      delayMs: 0,
      search: async ({ cursor }) => {
        calls++
        expect(cursor).toBe('failed-cursor')
        return dependencyError()
      }
    })
    expect(result).toMatchObject({ complete: false, reason: 'request_failed', pages: index, posts: 1 })
    expect(calls).toBe(1)
    expect(JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')).requestsThisRun).toBe(1)
    expect(
      JSON.parse(await readFile(join(out, 'pages', `${String(index).padStart(6, '0')}.json`), 'utf8'))
    ).toMatchObject({ index, requestCursor: 'failed-cursor', response: dependencyError() })
    expect((await rows(out)).map((row) => row.id)).toEqual(['1'])
  }
  expect(
    await runArchive({
      source: 'list',
      scope,
      out,
      resume: true,
      delayMs: 0,
      search: async () => page([tweet('2')], 'failed-cursor')
    })
  ).toMatchObject({ complete: false, reason: 'repeated_cursor', pages: 5, posts: 2 })
})

test('authorization, mixed, partial and Search GraphQL errors remain unsupported and cannot make resumed requests', async () => {
  const error = dependencyError().errors[0]
  const cases = [
    { source: 'list' as const, response: { ...dependencyError(), errors: [{ ...error, name: 'AuthorizationError' }] } },
    {
      source: 'list' as const,
      response: {
        ...dependencyError(),
        errors: [{ ...error, extensions: { ...error.extensions, name: 'UnknownError' } }]
      }
    },
    { source: 'list' as const, response: { ...dependencyError(), errors: [{ ...error, path: ['list', 'other'] }] } },
    { source: 'list' as const, response: { ...dependencyError(), errors: [] } },
    { source: 'list' as const, response: { data: dependencyError().data } },
    { source: 'list' as const, response: { ...dependencyError(), errors: [{ ...error, kind: 'Authorization' }] } },
    { source: 'list' as const, response: { ...dependencyError(), errors: [{ ...error, source: 'Client' }] } },
    {
      source: 'list' as const,
      response: {
        ...dependencyError(),
        errors: [{ ...error, extensions: { ...error.extensions, kind: 'Authorization' } }]
      }
    },
    {
      source: 'list' as const,
      response: { ...dependencyError(), errors: [{ ...error, extensions: { ...error.extensions, source: 'Client' } }] }
    },
    { source: 'list' as const, response: { ...dependencyError(), errors: [error, { name: 'AuthorizationError' }] } },
    { source: 'list' as const, response: { ...page([tweet('1')], 'next'), errors: [error] } },
    {
      source: 'list' as const,
      response: { ...dependencyError(), data: { list: { tweets_timeline: { unknown: true } } } }
    },
    { source: 'list' as const, response: { ...dependencyError(), data: null } },
    { source: 'list' as const, response: { ...dependencyError(), unexpected: true } },
    {
      source: 'list' as const,
      response: { ...dependencyError(), data: { ...dependencyError().data, unexpected: true } }
    },
    {
      source: 'list' as const,
      response: { ...dependencyError(), data: { list: { ...dependencyError().data.list, unexpected: true } } }
    },
    { source: 'search' as const, response: dependencyError() }
  ]
  for (const { source, response } of cases) {
    const out = await output()
    expect(await runArchive({ source, scope, out, delayMs: 0, search: async () => response })).toMatchObject({
      complete: false,
      reason: 'unsupported_payload',
      pages: 1,
      posts: 0
    })
    let calls = 0
    expect(
      await runArchive({
        source,
        scope,
        out,
        resume: true,
        delayMs: 0,
        search: async () => {
          calls++
          return page([])
        }
      })
    ).toMatchObject({ complete: false, reason: 'unsupported_payload', pages: 1, posts: 0 })
    expect(calls).toBe(0)
  }
})

test('List mode refuses Search-only seed imports before accessing the seed path', async () => {
  const out = await output()
  const options = {
    source: 'list' as const,
    scope,
    out,
    seedFrom: `${out}-missing-seed`,
    delayMs: 0,
    search: async () => page([])
  }
  await expect(runArchive(options)).rejects.toMatchObject({ code: 'invalid_params' })
})

test('List dry-run resolves separate output and endpoint without reading credentials or making requests', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--no-env-file',
      'scripts/archive-list-timeline.ts',
      '--dry-run',
      '--list-id',
      '123',
      '--from',
      '2026-01-01',
      '--until',
      '2026-01-02'
    ],
    { cwd: process.cwd(), env: { PATH: process.env.PATH }, encoding: 'utf8' }
  )
  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  const resolved = JSON.parse(result.stdout)
  expect(resolved).toMatchObject({
    listId: '123',
    from: '2025-12-31T15:00:00.000Z',
    until: '2026-01-01T15:00:00.000Z',
    endpoint,
    delayMs: 2500,
    maxPages: 1000,
    maxRequests: 1000,
    coverageVerified: false
  })
  expect(resolved.out).toContain('/.cache/list-timeline/')
  expect(JSON.stringify(resolved)).not.toContain('since:')
  const seeded = spawnSync(
    process.execPath,
    ['--no-env-file', 'scripts/archive-list-timeline.ts', '--dry-run', '--seed-from', '.cache/missing'],
    {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH },
      encoding: 'utf8'
    }
  )
  expect(seeded.status).toBe(1)
  expect(seeded.stderr).toContain('invalid_params')
})
