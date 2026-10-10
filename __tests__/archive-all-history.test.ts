import { afterEach, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runArchive } from '../scripts/lib/post-archive'

const scope = { listId: '2019028800869413128', from: '2025-10-07T15:00:00.000Z', until: '2026-10-08T03:45:12.345Z' }
const paths: string[] = []
afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
const output = async (cli = false) => {
  if (cli) await mkdir(resolve('.cache'), { recursive: true })
  const path = await mkdtemp(cli ? resolve('.cache/all-history-test-') : join(tmpdir(), 'all-history-test-'))
  paths.push(path)
  return path
}
const tweet = (id: string, createdAt: string) => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: { rest_id: '42', core: { name: '店', screen_name: 'bic_test' } } } },
  legacy: { id_str: id, created_at: createdAt, full_text: `投稿${id}`, entities: { hashtags: [] } }
})
const page = (tweets: unknown[], cursor?: string, source = 'list') => {
  const timeline = {
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
  return source === 'list'
    ? { data: { list: { tweets_timeline: { timeline } } } }
    : { data: { search_by_raw_query: { search_timeline: { timeline } } } }
}
const lines = async (out: string) =>
  (await readFile(join(out, 'posts.jsonl'), 'utf8')).trim().split('\n').filter(Boolean)
const invoke = (script: string, args: string[]) =>
  spawnSync(process.execPath, ['--no-env-file', script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } })

test('all-history List resume recovers older raw rows without changing captured scope or in-year observations', async () => {
  const out = await output()
  const year = tweet('1', '2026-10-07T23:00:00Z')
  const older = tweet('2', '2024-01-01T00:00:00Z')
  await runArchive({
    scope,
    source: 'list',
    out,
    maxPages: 1,
    delayMs: 0,
    search: async () => page([older, year], 'next')
  })
  const originalLine = (await lines(out))[0]
  const originalScope = await readFile(join(out, 'scope.json'), 'utf8')
  const originalRaw = await readFile(join(out, 'pages', '000001.json'), 'utf8')
  const progress: { posts: number; accounts: { posts: number }[] }[] = []
  const options = {
    scope,
    source: 'list' as const,
    out,
    resume: true,
    allHistory: true,
    delayMs: 0,
    onProgress: (value: { posts: number; accounts: { posts: number }[] }) => {
      progress.push(value)
    },
    search: async ({ cursor }: { cursor?: string }) => {
      expect(cursor).toBe('next')
      return page([tweet('3', '2020-01-01T00:00:00Z'), year])
    }
  }
  expect(await runArchive(options)).toMatchObject({ complete: true, posts: 3, normalizationMode: 'all_history' })
  expect(await readFile(join(out, 'scope.json'), 'utf8')).toBe(originalScope)
  expect(await readFile(join(out, 'pages', '000001.json'), 'utf8')).toBe(originalRaw)
  const saved = await lines(out)
  expect(saved.map((line) => JSON.parse(line).id).sort()).toEqual(['1', '2', '3'])
  expect(saved.find((line) => JSON.parse(line).id === '1')).toBe(originalLine)
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
  expect(manifest).toMatchObject({
    normalizationMode: 'all_history',
    captureScope: scope,
    effectiveScope: { from: null, until: scope.until }
  })
  expect(manifest.accounts).toEqual([{ key: 'id:42', authorId: '42', screenName: 'bic_test', posts: 3 }])
  expect(progress[0]).toMatchObject({ posts: 2, accounts: [{ posts: 2 }] })
  expect(progress.at(-1)).toMatchObject({ posts: 3, accounts: [{ posts: 3 }] })
})

test('all-history removes only List lower bound and still excludes the fixed upper instant', async () => {
  const out = await output()
  const options = {
    scope,
    source: 'list' as const,
    allHistory: true,
    out,
    delayMs: 0,
    search: async () =>
      page([tweet('1', '1900-01-01T00:00:00Z'), tweet('2', '2026-10-08T03:45:12.344Z'), tweet('3', scope.until)])
  }
  expect(await runArchive(options)).toMatchObject({ posts: 2 })
  expect((await lines(out)).map((line) => JSON.parse(line).id)).toEqual(['1', '2'])
})

test('API default remains bounded and Search rejects a List-only allHistory option', async () => {
  for (const source of ['list', 'search'] as const) {
    const out = await output()
    const options = {
      scope,
      source,
      out,
      delayMs: 0,
      search: async () =>
        page([tweet('1', '2024-01-01T00:00:00Z'), tweet('2', '2026-10-07T23:00:00Z')], undefined, source)
    }
    expect(await runArchive(options)).toMatchObject({ posts: 1 })
    expect((await lines(out)).map((line) => JSON.parse(line).id)).toEqual(['2'])
  }
  const out = await output()
  const unsupported = {
    scope,
    source: 'search' as const,
    allHistory: true,
    out,
    search: async () => page([], undefined, 'search')
  }
  await expect(runArchive(unsupported)).rejects.toMatchObject({ code: 'invalid_params' })
})

test('List CLI defaults to all-history on old cache resume without treating saved from as explicit', async () => {
  const out = await output(true)
  await runArchive({
    scope,
    source: 'list',
    out,
    maxPages: 1,
    delayMs: 0,
    search: async () => page([tweet('1', '2024-01-01T00:00:00Z')], 'next')
  })
  const result = invoke('scripts/archive-list-timeline.ts', ['--resume', '--out', out, '--dry-run'])
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({
    normalizationMode: 'all_history',
    captureScope: scope,
    effectiveScope: { from: null, until: scope.until }
  })
  for (const extra of [['--date-window'], ['--from', '2025-10-08']]) {
    const bounded = invoke('scripts/archive-list-timeline.ts', ['--resume', '--out', out, '--dry-run', ...extra])
    expect(bounded.status).toBe(0)
    expect(JSON.parse(bounded.stdout)).toMatchObject({
      normalizationMode: 'date_window',
      captureScope: scope,
      effectiveScope: { from: scope.from, until: scope.until }
    })
  }
})

test('List date-window or explicit from retains bounded normalization and Search rejects List-only optout', () => {
  for (const args of [['--date-window'], ['--from', '2025-10-08']]) {
    const result = invoke('scripts/archive-list-timeline.ts', ['--dry-run', ...args])
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toMatchObject({
      normalizationMode: 'date_window',
      effectiveScope: { from: parsed.from, until: parsed.until }
    })
  }
  const search = invoke('scripts/archive-list-posts.ts', ['--dry-run', '--date-window'])
  expect(search.status).toBe(1)
  expect(search.stderr).toContain('[invalid_params]')
})
