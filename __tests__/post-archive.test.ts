import { afterEach, expect, spyOn, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ArchiveFailure,
  archiveDiagnostic,
  archiveQueryWindow,
  parseArchivePage,
  resolveArchiveScope,
  runArchive
} from '../scripts/lib/post-archive'
import { Client } from '../workers/bot/src/timeline/client'
import { dayjs } from '../workers/bot/src/timeline/utils/dayjs'

const api = () => ({ resolveArchiveScope, runArchive })
type Scope = Parameters<typeof runArchive>[0]['scope']
const scope: Scope = {
  listId: '2019028800869413128',
  from: '2026-10-07T15:00:00.000Z',
  until: '2026-10-08T03:45:12.345Z'
}
const paths: string[] = []
afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const output = async () => {
  const path = await mkdtemp(join(tmpdir(), 'post-archive-'))
  paths.push(path)
  return path
}
const rawTweet = (id: string, createdAt = '2026-10-07T23:00:00Z') => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: { rest_id: '42', core: { name: '店', screen_name: 'bic_test' } } } },
  legacy: {
    id_str: id,
    created_at: createdAt,
    full_text: '通常のお知らせ #テスト',
    in_reply_to_status_id_str: '100',
    in_reply_to_user_id_str: '41',
    entities: { hashtags: [{ text: 'テスト', indices: [8, 12] }] },
    favorite_count: 123
  }
})
const withInstructions = (instructions: unknown[]) => ({
  data: { search_by_raw_query: { search_timeline: { timeline: { instructions } } } },
  extraMetadata: { preserved: true }
})
const page = (tweets: unknown[], cursor?: string) =>
  withInstructions([
    {
      type: 'TimelineAddEntries',
      entries: [
        ...tweets.map((result, index) => ({
          entryId: `tweet-${index}`,
          content: {
            entryType: 'TimelineTimelineItem',
            itemContent: { itemType: 'TimelineTweet', tweet_results: { result } }
          }
        })),
        ...(cursor
          ? [
              {
                entryId: 'cursor-bottom',
                content: {
                  entryType: 'TimelineTimelineCursor',
                  cursorType: 'Bottom',
                  value: cursor
                }
              }
            ]
          : [])
      ]
    }
  ])
const replacementCursors = (cursor: string) =>
  withInstructions(
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

test('archive defaults capture today’s instant and the JST calendar date one year earlier', () => {
  expect(api().resolveArchiveScope({}, dayjs('2026-10-08T03:45:12.345Z').toDate())).toEqual({
    ...scope,
    from: '2025-10-07T15:00:00.000Z'
  })
  expect(api().resolveArchiveScope({}, dayjs('2024-02-29T15:30:00Z').toDate()).from).toBe('2023-02-28T15:00:00.000Z')
  expect(api().resolveArchiveScope({}, dayjs('2024-02-29T03:00:00Z').toDate()).from).toBe('2023-02-27T15:00:00.000Z')
})

test('explicit date boundaries are JST midnight and until remains exclusive', () => {
  expect(
    api().resolveArchiveScope({ listId: '123', from: '2026-01-01', until: '2026-01-02' }, dayjs().toDate())
  ).toEqual({
    listId: '123',
    from: '2025-12-31T15:00:00.000Z',
    until: '2026-01-01T15:00:00.000Z'
  })
})

test('date parser rejects rollover dates, timestamps, reversed bounds and nonnumeric list IDs', () => {
  const resolve = api().resolveArchiveScope
  for (const from of ['', '2026-02-29', '2026-13-01', '2026-1-01', '2026-01-01T00:00:00Z']) {
    expect(() => resolve({ from }, dayjs('2026-10-08T03:00:00Z').toDate())).toThrow()
  }
  expect(() => resolve({ from: '2026-10-09', until: '2026-10-08' }, dayjs().toDate())).toThrow()
  expect(() => resolve({ listId: '123 OR filter:links' }, dayjs().toDate())).toThrow()
  expect(() => resolve({ until: '2026-10-09' }, dayjs('2026-10-08T03:00:00Z').toDate())).toThrow()
})

test('collector traverses seven pages and an empty page with a next cursor', async () => {
  const out = await output()
  let index = 0
  const result = await api().runArchive({
    scope,
    out,
    delayMs: 0,
    search: async ({ cursor, listId }) => {
      expect(listId).toBe(scope.listId)
      expect(cursor).toBe(index ? `next-${index}` : undefined)
      index++
      return page(index === 3 ? [] : [rawTweet(String(index))], index < 7 ? `next-${index}` : undefined)
    }
  })
  expect(result).toMatchObject({ complete: true, reason: 'search_exhausted', pages: 7, posts: 6 })
  expect((await rows(out)).map((item) => item.id)).toEqual(['1', '2', '4', '5', '6', '7'])
})

test('collector archives ordinary replies and hashtags with raw metadata and exact instant filtering', async () => {
  const out = await output()
  const raw = page([
    rawTweet('1', '2026-10-07T14:59:59.999Z'),
    rawTweet('2', scope.from),
    rawTweet('3', '2026-10-08T03:45:12.344Z'),
    rawTweet('4', scope.until)
  ])
  await api().runArchive({ scope, out, delayMs: 0, search: async () => raw })
  const archived = await rows(out)
  expect(archived.map((item) => item.id)).toEqual(['2', '3'])
  expect(archived[0]).toMatchObject({
    text: '通常のお知らせ #テスト',
    createdAt: scope.from,
    author: { id: '42', name: '店', screenName: 'bic_test' },
    replyToStatusId: '100',
    replyToUserId: '41',
    hashtags: ['テスト'],
    raw: rawTweet('2', scope.from)
  })
  const stored = JSON.parse(await readFile(join(out, 'pages', '000001.json'), 'utf8'))
  expect(stored.response).toEqual(raw)
})

test('supported visibility wrapper keeps original metadata and full note text', async () => {
  const out = await output()
  const original = {
    __typename: 'TweetWithVisibilityResults',
    visibilityResults: { reason: 'test' },
    tweet: { ...rawTweet('1'), note_tweet: { note_tweet_results: { result: { text: '長い本文の完全版' } } } }
  }
  const response = page([original])
  const result = await api().runArchive({ scope, out, delayMs: 0, search: async () => response })
  expect(result.complete).toBe(true)
  expect((await rows(out))[0]).toMatchObject({ id: '1', text: '長い本文の完全版', raw: original })
})

test('overlapping pages and resume produce one normalized row per tweet ID', async () => {
  const out = await output()
  await api().runArchive({ scope, out, maxPages: 1, delayMs: 0, search: async () => page([rawTweet('1')], 'next') })
  const result = await api().runArchive({
    scope,
    out,
    resume: true,
    delayMs: 0,
    search: async ({ cursor }) => {
      expect(cursor).toBe('next')
      return page([rawTweet('1'), rawTweet('2')])
    }
  })
  expect(result).toMatchObject({ complete: true, posts: 2, pages: 2 })
  expect((await rows(out)).map((item) => item.id)).toEqual(['1', '2'])
})

test('resume rebuilds derived JSONL after interruption without losing a saved page', async () => {
  const out = await output()
  await api().runArchive({ scope, out, maxPages: 1, delayMs: 0, search: async () => page([rawTweet('1')], 'next') })
  await writeFile(join(out, 'posts.jsonl'), '{partial')
  await rm(join(out, 'checkpoint.json'))
  const result = await api().runArchive({
    scope,
    out,
    resume: true,
    delayMs: 0,
    search: async ({ cursor }) => {
      expect(cursor).toBe('next')
      return page([rawTweet('2')])
    }
  })
  expect(result.complete).toBe(true)
  expect((await rows(out)).map((item) => item.id)).toEqual(['1', '2'])
})

test('resume rejects changed persisted scope without a request', async () => {
  const out = await output()
  await api().runArchive({ scope, out, maxPages: 1, delayMs: 0, search: async () => page([rawTweet('1')], 'next') })
  let requested = false
  await expect(
    api().runArchive({
      scope: { ...scope, listId: '999' },
      out,
      resume: true,
      search: async () => {
        requested = true
        return page([])
      }
    })
  ).rejects.toThrow()
  expect(requested).toBe(false)
})

test('missing or corrupt authoritative resume cache fails closed', async () => {
  const out = await output()
  await expect(api().runArchive({ scope, out, resume: true, search: async () => page([]) })).rejects.toThrow()
  await api().runArchive({ scope, out, maxPages: 1, delayMs: 0, search: async () => page([rawTweet('1')], 'next') })
  await writeFile(join(out, 'pages', '000001.json'), '{partial')
  await expect(api().runArchive({ scope, out, resume: true, search: async () => page([]) })).rejects.toThrow()
})

test('repeated cursor preserves responses and records incomplete coverage', async () => {
  const out = await output()
  const result = await api().runArchive({ scope, out, delayMs: 0, search: async () => page([rawTweet('1')], 'same') })
  expect(result).toMatchObject({ complete: false, reason: 'repeated_cursor', pages: 2 })
  expect(JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))).toMatchObject({
    complete: false,
    reason: 'repeated_cursor'
  })
})

test('identical nonempty payload with changing cursors cannot claim exhaustion', async () => {
  const out = await output()
  let index = 0
  const result = await api().runArchive({
    scope,
    out,
    delayMs: 0,
    search: async () => page([rawTweet('1')], `cursor-${++index}`)
  })
  expect(result).toMatchObject({ complete: false, reason: 'non_advancing', pages: 2 })
})

test('page and request budgets save resumable incomplete coverage', async () => {
  for (const budget of [{ maxPages: 1 }, { maxRequests: 1 }]) {
    const out = await output()
    let index = 0
    const result = await api().runArchive({
      scope,
      out,
      ...budget,
      delayMs: 0,
      search: async () => page([rawTweet(String(++index))], 'next')
    })
    expect(result).toMatchObject({ complete: false, pages: 1, posts: 1 })
    expect(result.reason).toBe('budget')
    expect(JSON.parse(await readFile(join(out, 'checkpoint.json'), 'utf8')).nextCursor).toBe('next')
  }
})

test('unsupported or inaccessible entries preserve raw response and fail closed', async () => {
  for (const response of [{ unexpected: true }, page([{ __typename: 'TweetUnavailable' }])]) {
    const out = await output()
    const result = await api().runArchive({ scope, out, delayMs: 0, search: async () => response })
    expect(result).toMatchObject({ complete: false, reason: 'unsupported_payload', pages: 1 })
    expect(JSON.parse(await readFile(join(out, 'pages', '000001.json'), 'utf8')).response).toEqual(response)
  }
})

test('network/auth/rate failures record incomplete coverage without leaking error content', async () => {
  const out = await output()
  const result = await api().runArchive({
    scope,
    out,
    delayMs: 0,
    search: async () => {
      throw new Error('Bearer secret-value Cookie auth_token=secret-cookie')
    }
  })
  expect(result).toMatchObject({ complete: false, reason: 'request_failed', pages: 0 })
  const manifest = await readFile(join(out, 'manifest.json'), 'utf8')
  expect(manifest).not.toContain('secret-value')
  expect(manifest).not.toContain('secret-cookie')
})

test('raw signed client saves malformed HTTP-200 body before rejecting coverage', async () => {
  const out = await output()
  const raw = { errors: [{ code: 99, message: 'Malformed API response' }], metadata: 'kept' }
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        expect(request.headers.get('x-client-transaction-id')).toBe('archive-signed')
        expect(JSON.parse(new URL(request.url).searchParams.get('variables') || '{}')).toMatchObject({
          rawQuery: 'list:2019028800869413128 since:2026-10-07 until:2026-10-10',
          count: 20,
          product: 'Latest'
        })
        return Response.json(raw)
      },
      { preconnect: () => {} }
    )
  )
  try {
    const client = new Client(
      { TWITTER_BEARER_TOKEN: 'test', TWITTER_AUTH_TOKEN: 'test', TWITTER_CSRF_TOKEN: 'test' },
      async () => ({ generateTransactionId: async () => 'archive-signed' })
    )
    const result = await runArchive({ scope, out, delayMs: 0, search: client.searchRaw })
    expect(result).toMatchObject({ complete: false, reason: 'unsupported_payload', pages: 1 })
    expect(JSON.parse(await readFile(join(out, 'pages', '000001.json'), 'utf8')).response).toEqual(raw)
    await expect(client.search({ ...archiveQueryWindow(scope) })).rejects.toThrow()
  } finally {
    fetchSpy.mockRestore()
  }
})

test('replace entries and module additions archive actual X date strings', () => {
  const tweet = rawTweet('99', 'Wed Oct 07 23:00:00 +0000 2026')
  const item = { itemContent: { tweet_results: { result: tweet } } }
  const response = withInstructions([
    { type: 'TimelineReplaceEntry', entry: { content: item } },
    { type: 'TimelineAddToModule', moduleItems: [{ item }] }
  ])
  const parsed = parseArchivePage(response)
  expect(parsed.posts).toHaveLength(2)
  expect(parsed.posts[0].createdAt).toBe('2026-10-07T23:00:00.000Z')
})

test('A-B-A cursor cycle stops incomplete even when every page adds posts', async () => {
  const out = await output()
  let index = 0
  const result = await runArchive({
    scope,
    out,
    delayMs: 0,
    search: async () => {
      const cursor = ['A', 'B', 'A'][index++]
      return page([rawTweet(String(index))], cursor)
    }
  })
  expect(result).toMatchObject({ complete: false, reason: 'repeated_cursor', pages: 3, posts: 3 })
})

test('malformed tweet timestamps cannot produce a successful empty archive', async () => {
  const out = await output()
  expect(
    await runArchive({ scope, out, delayMs: 0, search: async () => page([rawTweet('1', 'invalid-date')]) })
  ).toMatchObject({ complete: false, reason: 'unsupported_payload' })
})

test('calendar-day slices progress independently and resume after a terminal day', async () => {
  const out = await output()
  const twoDays = { ...scope, from: '2026-10-06T15:00:00.000Z' }
  const first = await runArchive({
    scope: twoDays,
    out,
    maxPages: 1,
    delayMs: 0,
    search: async ({ since, until, cursor }) => {
      expect(cursor).toBeUndefined()
      expect(since.format('YYYY-MM-DD')).toBe('2026-10-06')
      expect(until.add(1, 'day').format('YYYY-MM-DD')).toBe('2026-10-09')
      return page([rawTweet('1', '2026-10-07T00:00:00Z'), rawTweet('2', '2026-10-08T00:00:00Z')])
    }
  })
  expect(first).toMatchObject({ complete: false, reason: 'budget', pages: 1, posts: 1 })
  const partial = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(partial.days.map((day: { complete: boolean }) => day.complete)).toEqual([true, false])
  const second = await runArchive({
    scope: twoDays,
    out,
    resume: true,
    delayMs: 0,
    search: async ({ since, until, cursor }) => {
      expect(cursor).toBeUndefined()
      expect(since.format('YYYY-MM-DD')).toBe('2026-10-07')
      expect(until.add(1, 'day').format('YYYY-MM-DD')).toBe('2026-10-10')
      return page([rawTweet('1', '2026-10-07T00:00:00Z'), rawTweet('2', '2026-10-08T00:00:00Z')])
    }
  })
  expect(second).toMatchObject({ complete: true, pages: 2, posts: 2 })
  expect((await rows(out)).map((item) => item.id)).toEqual(['1', '2'])
  const final = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(final.days.map((day: { complete: boolean }) => day.complete)).toEqual([true, true])
})

test('explicit Bottom termination ends a day despite a remaining cursor', async () => {
  const out = await output()
  const response = withInstructions([
    ...page([rawTweet('1')], 'unused').data.search_by_raw_query.search_timeline.timeline.instructions,
    { type: 'TimelineTerminateTimeline', direction: 'Bottom' }
  ])
  expect(await runArchive({ scope, out, delayMs: 0, search: async () => response })).toMatchObject({
    complete: true,
    reason: 'search_exhausted',
    pages: 1
  })
})

test('resume rejects a missing journal page rather than trusting derived completion', async () => {
  const out = await output()
  await runArchive({ scope, out, delayMs: 0, search: async () => page([rawTweet('1')]) })
  await rm(join(out, 'pages', '000001.json'))
  await expect(runArchive({ scope, out, resume: true, search: async () => page([]) })).rejects.toThrow()
})

test('CLI dry run resolves daily query without authentication and rejects invalid options', () => {
  const result = spawnSync(
    process.execPath,
    ['--no-env-file', 'scripts/archive-list-posts.ts', '--dry-run', '--from', '2026-10-07', '--until', '2026-10-08'],
    { encoding: 'utf8', env: { PATH: process.env.PATH } }
  )
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({
    from: '2026-10-06T15:00:00.000Z',
    until: '2026-10-07T15:00:00.000Z',
    daySlices: 1,
    firstQuery: 'list:2019028800869413128 since:2026-10-06 until:2026-10-09'
  })
  for (const options of [
    ['--from', '2026-02-30'],
    ['--max-pages', '0'],
    ['--out', '/tmp/public-posts'],
    ['--unknown']
  ]) {
    const invalid = spawnSync(
      process.execPath,
      ['--no-env-file', 'scripts/archive-list-posts.ts', '--dry-run', ...options],
      { encoding: 'utf8', env: { PATH: process.env.PATH } }
    )
    expect(invalid.status).toBe(1)
  }
})

test('three strict continuation replacement pairs finish a day with an empirical terminal reason', async () => {
  const out = await output()
  let index = 0
  const result = await runArchive({
    scope,
    out,
    maxPages: 6,
    delayMs: 0,
    search: async () => {
      index++
      return index === 1 ? page([rawTweet('1')], 'first') : replacementCursors(`cursor-${index}`)
    }
  })
  expect(result).toMatchObject({ complete: true, reason: 'search_exhausted', pages: 4, posts: 1 })
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(manifest.days[0]).toMatchObject({
    terminalReason: 'confirmed_cursor_only',
    inWindowPosts: 1,
    minTimestamp: '2026-10-07T23:00:00.000Z',
    maxTimestamp: '2026-10-07T23:00:00.000Z'
  })
  expect(manifest.exhaustionPolicy).toMatchObject({ version: 1, consecutiveReplacementPairs: 3 })
})

test('cursor-only confirmation reconstructs across resume and advances to the next day', async () => {
  const out = await output()
  const twoDays = { ...scope, from: '2026-10-06T15:00:00.000Z' }
  let index = 0
  const search = async () => {
    index++
    return index === 1 ? page([rawTweet('1', '2026-10-07T00:00:00Z')], 'start') : replacementCursors(`cursor-${index}`)
  }
  expect(await runArchive({ scope: twoDays, out, maxPages: 3, delayMs: 0, search })).toMatchObject({
    complete: false,
    pages: 3
  })
  const result = await runArchive({
    scope: twoDays,
    out,
    resume: true,
    delayMs: 0,
    search: async ({ cursor, since }) => {
      if (cursor) {
        expect(cursor).toBe('cursor-3')
        return replacementCursors('cursor-4')
      }
      expect(since.format('YYYY-MM-DD')).toBe('2026-10-07')
      return page([rawTweet('2')])
    }
  })
  expect(result).toMatchObject({ complete: true, pages: 5, posts: 2 })
})

test('tweets and empty AddEntries reset replacement-only confirmation', async () => {
  const out = await output()
  const responses = [
    page([rawTweet('1')], 'a'),
    replacementCursors('b'),
    replacementCursors('c'),
    page([], 'd'),
    replacementCursors('e'),
    replacementCursors('f'),
    page([rawTweet('2')], 'g'),
    replacementCursors('h'),
    replacementCursors('i'),
    page([rawTweet('3')])
  ]
  let index = 0
  const result = await runArchive({ scope, out, delayMs: 0, search: async () => responses[index++] })
  expect(result).toMatchObject({ complete: true, pages: 10, posts: 3 })
})

test('repeated cursor and API errors override empty confirmation', async () => {
  for (const last of [replacementCursors('c'), { errors: [{ message: 'failure' }] }]) {
    const out = await output()
    const responses = [page([rawTweet('1')], 'a'), replacementCursors('b'), replacementCursors('c'), last]
    let index = 0
    const result = await runArchive({ scope, out, delayMs: 0, search: async () => responses[index++] })
    expect(result.complete).toBe(false)
    expect(result.reason).toBe('errors' in last ? 'unsupported_payload' : 'repeated_cursor')
  }
})

test('replacement pairs require matching identifiers and an existing continuation request', async () => {
  const out = await output()
  let index = 0
  const result = await runArchive({
    scope,
    out,
    maxPages: 3,
    delayMs: 0,
    search: async () => replacementCursors(`cursor-${++index}`)
  })
  expect(result).toMatchObject({ complete: false, reason: 'budget', pages: 3 })
  const other = await output()
  index = 0
  const invalidPair = (cursor: string) =>
    withInstructions(
      ['Top', 'Bottom'].map((cursorType) => ({
        type: 'TimelineReplaceEntry',
        entry_id_to_replace: 'different-entry',
        entry: {
          entryId: `cursor-${cursorType}`,
          content: {
            cursorType,
            value: cursor,
            entryType: 'TimelineTimelineCursor',
            __typename: 'TimelineTimelineCursor'
          }
        }
      }))
    )
  const mismatch = await runArchive({
    scope,
    out: other,
    maxPages: 5,
    delayMs: 0,
    search: async () => invalidPair(`cursor-${++index}`)
  })
  expect(mismatch).toMatchObject({ complete: false, reason: 'budget', pages: 5 })
})

test('duplicate terminal page without next cursor completes instead of reporting non-advance', async () => {
  const out = await output()
  let index = 0
  expect(
    await runArchive({
      scope,
      out,
      delayMs: 0,
      search: async () => page([rawTweet('1')], index++ === 0 ? 'next' : undefined)
    })
  ).toMatchObject({ complete: true, pages: 2, posts: 1 })
})

test('empty media-only text and author display name remain archiveable', async () => {
  const out = await output()
  const tweet = rawTweet('1')
  tweet.legacy.full_text = ''
  tweet.core.user_results.result.core.name = ''
  expect(await runArchive({ scope, out, delayMs: 0, search: async () => page([tweet]) })).toMatchObject({
    complete: true,
    posts: 1
  })
  expect((await rows(out))[0]).toMatchObject({ text: '', author: { name: '' } })
})

test('resume ignores known journal directory metadata and repairs scope-before-pages crash', async () => {
  const out = await output()
  await runArchive({ scope, out, maxPages: 1, delayMs: 0, search: async () => page([rawTweet('1')], 'next') })
  await writeFile(join(out, 'pages', '.DS_Store'), 'metadata')
  await writeFile(join(out, 'pages', '000002.json.tmp'), 'partial')
  expect(
    await runArchive({ scope, out, resume: true, delayMs: 0, search: async () => page([rawTweet('2')]) })
  ).toMatchObject({ complete: true, posts: 2 })
  const interrupted = await output()
  await writeFile(join(interrupted, 'scope.json'), await readFile(join(out, 'scope.json')))
  expect(
    await runArchive({ scope, out: interrupted, resume: true, delayMs: 0, search: async () => page([]) })
  ).toMatchObject({ complete: true, pages: 1 })
})

test('delay rejects timer overflow and CLI exposes only fixed diagnostics', async () => {
  const out = await output()
  await expect(runArchive({ scope, out, delayMs: 2147483648, search: async () => page([]) })).rejects.toThrow()
  const result = spawnSync(
    process.execPath,
    ['--no-env-file', 'scripts/archive-list-posts.ts', '--dry-run', '--from', 'secret-token'],
    { encoding: 'utf8', env: { PATH: process.env.PATH } }
  )
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('[invalid_params]')
  expect(result.stderr).not.toContain('secret-token')
})

test('safe diagnostics classify known failures without rendering arbitrary error content', () => {
  expect(archiveDiagnostic(new ArchiveFailure('locked'))).toContain('[locked]')
  expect(archiveDiagnostic(new ArchiveFailure('scope_mismatch'))).toContain('[scope_mismatch]')
  expect(archiveDiagnostic(new ArchiveFailure('missing_journal'))).toContain('[missing_journal]')
  expect(archiveDiagnostic(new ArchiveFailure('corrupt_journal'))).toContain('[corrupt_journal]')
  const failure = archiveDiagnostic(new Error('Bearer secret Cookie auth_token=secret'))
  expect(failure).toContain('[unexpected]')
  expect(failure).not.toContain('Bearer')
  expect(failure).not.toContain('auth_token')
})

test('old exhaustion-policy cache is retained and rejected without a new request', async () => {
  const out = await output()
  await runArchive({ scope, out, maxPages: 1, delayMs: 0, search: async () => page([rawTweet('1')], 'next') })
  const old = JSON.parse(await readFile(join(out, 'scope.json'), 'utf8'))
  old.schema = 1
  delete old.exhaustionPolicy
  await writeFile(join(out, 'scope.json'), JSON.stringify(old))
  let requested = false
  await expect(
    runArchive({
      scope,
      out,
      resume: true,
      search: async () => {
        requested = true
        return page([])
      }
    })
  ).rejects.toMatchObject({ code: 'scope_mismatch' })
  expect(requested).toBe(false)
  expect(JSON.parse(await readFile(join(out, 'pages', '000001.json'), 'utf8')).response).toEqual(
    page([rawTweet('1')], 'next')
  )
})

test('module responses reset confirmation and unknown extra instructions fail closed', async () => {
  const out = await output()
  const modulePage = withInstructions([
    ...replacementCursors('d').data.search_by_raw_query.search_timeline.timeline.instructions,
    { type: 'TimelineAddToModule', moduleItems: [] }
  ])
  const responses = [
    page([rawTweet('1')], 'a'),
    replacementCursors('b'),
    replacementCursors('c'),
    modulePage,
    replacementCursors('e'),
    replacementCursors('f'),
    page([rawTweet('2')])
  ]
  let index = 0
  expect(await runArchive({ scope, out, delayMs: 0, search: async () => responses[index++] })).toMatchObject({
    complete: true,
    pages: 7
  })
  const other = await output()
  const unknown = withInstructions([
    ...replacementCursors('g').data.search_by_raw_query.search_timeline.timeline.instructions,
    { type: 'UnknownInstruction' }
  ])
  expect(await runArchive({ scope, out: other, delayMs: 0, search: async () => unknown })).toMatchObject({
    complete: false,
    reason: 'unsupported_payload'
  })
})

type ProgressSnapshot = {
  date: string
  completedDays: number
  totalDays: number
  pages: number
  posts: number
  status: string
  accounts: { key: string; authorId?: string; screenName: string; posts: number }[]
}

test('progress snapshots announce next JST day before its request and only report saved journal counts', async () => {
  const out = await output()
  const twoDays = { ...scope, from: '2026-10-06T15:00:00.000Z' }
  const snapshots: ProgressSnapshot[] = []
  const durability: boolean[] = []
  let index = 0
  const options = {
    scope: twoDays,
    out,
    delayMs: 0,
    onProgress: (value: ProgressSnapshot) => {
      snapshots.push(value)
      const persisted = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
      durability.push(persisted.pages === value.pages && persisted.posts === value.posts)
    },
    search: async () => {
      expect(snapshots.at(-1)).toMatchObject({
        date: index ? '2026-10-08' : '2026-10-07',
        completedDays: index,
        pages: index,
        posts: index
      })
      index++
      return page([rawTweet(String(index), index === 1 ? '2026-10-07T00:00:00Z' : '2026-10-08T00:00:00Z')])
    }
  }
  expect(await runArchive(options)).toMatchObject({ complete: true, pages: 2, posts: 2 })
  expect(snapshots[0]).toMatchObject({
    date: '2026-10-07',
    completedDays: 0,
    totalDays: 2,
    pages: 0,
    posts: 0,
    status: 'running'
  })
  expect(snapshots.at(-1)).toMatchObject({
    date: '2026-10-08',
    completedDays: 2,
    totalDays: 2,
    pages: 2,
    posts: 2,
    status: 'search_exhausted'
  })
  expect(durability).toHaveLength(snapshots.length)
  expect(durability.every(Boolean)).toBe(true)
})

test('account totals dedupe IDs, exclude overfetch and distinguish stable IDs from fallback handles', async () => {
  const out = await output()
  const authored = (id: string, authorId: string | undefined, handle: string, createdAt?: string) => {
    const tweet = rawTweet(id, createdAt)
    return {
      ...tweet,
      core: {
        user_results: {
          result: {
            ...tweet.core.user_results.result,
            rest_id: authorId,
            core: { name: '店', screen_name: handle }
          }
        }
      }
    }
  }
  const response = page([
    authored('1', '42', 'bic_old'),
    authored('1', '42', 'bic_old'),
    authored('2', '42', 'bic_new'),
    authored('3', '99', 'bic_new'),
    authored('4', undefined, 'BIC_NEW'),
    authored('5', undefined, 'bic_new'),
    authored('6', '55', 'outside', '2026-10-07T00:00:00Z')
  ])
  const snapshots: ProgressSnapshot[] = []
  const options = {
    scope,
    out,
    delayMs: 0,
    search: async () => response,
    onProgress: (value: ProgressSnapshot) => {
      snapshots.push(value)
    }
  }
  await runArchive(options)
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(manifest.accounts).toEqual([
    { key: 'handle:bic_new', screenName: 'bic_new', posts: 2 },
    { key: 'id:42', authorId: '42', screenName: 'bic_new', posts: 2 },
    { key: 'id:99', authorId: '99', screenName: 'bic_new', posts: 1 }
  ])
  expect(snapshots.at(-1)).toMatchObject({ posts: 5, accounts: manifest.accounts })
})

test('resume reconstructs account progress before the next request and callback exceptions are harmless', async () => {
  const out = await output()
  await runArchive({ scope, out, maxPages: 1, delayMs: 0, search: async () => page([rawTweet('1')], 'next') })
  const snapshots: ProgressSnapshot[] = []
  const options = {
    scope,
    out,
    resume: true,
    delayMs: 0,
    onProgress: (value: ProgressSnapshot) => {
      snapshots.push(value)
      throw new Error('Broken display callback')
    },
    search: async () => {
      expect(snapshots[0]).toMatchObject({
        pages: 1,
        posts: 1,
        status: 'running',
        accounts: [{ key: 'id:42', posts: 1 }]
      })
      return page([rawTweet('1'), rawTweet('2')])
    }
  }
  expect(await runArchive(options)).toMatchObject({ complete: true, pages: 2, posts: 2 })
  expect(snapshots.at(-1)).toMatchObject({ posts: 2, accounts: [{ key: 'id:42', posts: 2 }] })
  expect(snapshots[0]).toMatchObject({ posts: 1, accounts: [{ key: 'id:42', posts: 1 }] })
})

test('progress final status distinguishes budget and request failure without exposing the cause', async () => {
  for (const networkFailure of [false, true]) {
    const out = await output()
    const snapshots: ProgressSnapshot[] = []
    const options = {
      scope,
      out,
      maxPages: 1,
      delayMs: 0,
      onProgress: (value: ProgressSnapshot) => {
        snapshots.push(value)
      },
      search: async () => {
        if (networkFailure) throw new Error('secret-cookie')
        return page([rawTweet('1')], 'next')
      }
    }
    await runArchive(options)
    expect(snapshots.at(-1)).toMatchObject({ status: networkFailure ? 'request_failed' : 'budget' })
    expect(JSON.stringify(snapshots)).not.toContain('secret-cookie')
  }
})

test('duplicate metadata refresh moves account contribution once and display mutation cannot change accounting', async () => {
  const out = await output()
  const refreshed = rawTweet('1')
  refreshed.core.user_results.result.rest_id = '99'
  refreshed.core.user_results.result.core.screen_name = 'bic_updated'
  const other = rawTweet('2')
  other.core.user_results.result.rest_id = '99'
  other.core.user_results.result.core.screen_name = 'bic_updated'
  let index = 0
  const options = {
    scope,
    out,
    delayMs: 0,
    search: async () => (index++ === 0 ? page([rawTweet('1')], 'next') : page([refreshed, other])),
    onProgress: (snapshot: ProgressSnapshot) => {
      if (snapshot.accounts[0]) snapshot.accounts[0].posts = 999
      snapshot.accounts.splice(0)
    }
  }
  expect(await runArchive(options)).toMatchObject({ complete: true, posts: 2 })
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(manifest.accounts).toEqual([{ key: 'id:99', authorId: '99', screenName: 'bic_updated', posts: 2 }])
})

test('asynchronous display failures cannot prevent collection and progress leaves scope bytes unchanged', async () => {
  const out = await output()
  await runArchive({ scope, out, maxPages: 1, delayMs: 0, search: async () => page([rawTweet('1')], 'next') })
  const persistedScope = await readFile(join(out, 'scope.json'), 'utf8')
  expect(
    await runArchive({
      scope,
      out,
      resume: true,
      delayMs: 0,
      search: async () => page([rawTweet('2')]),
      onProgress: async () => {
        throw new Error('Asynchronous display error')
      }
    })
  ).toMatchObject({ complete: true, posts: 2 })
  expect(await readFile(join(out, 'scope.json'), 'utf8')).toBe(persistedScope)
})

test('request failure after advancing a day reports the attempted day rather than the prior saved page', async () => {
  const out = await output()
  const snapshots: ProgressSnapshot[] = []
  let index = 0
  const options = {
    scope: { ...scope, from: '2026-10-06T15:00:00.000Z' },
    out,
    delayMs: 0,
    onProgress: (snapshot: ProgressSnapshot) => {
      snapshots.push(snapshot)
    },
    search: async () => {
      if (index++) throw new Error('Network failure')
      return page([rawTweet('1', '2026-10-07T00:00:00Z')])
    }
  }
  await runArchive(options)
  expect(snapshots.at(-1)).toMatchObject({
    date: '2026-10-08',
    completedDays: 1,
    pages: 1,
    posts: 1,
    status: 'request_failed'
  })
})
