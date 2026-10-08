import { lstat, realpath } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { X_BEARER } from '@biccame/shared/x/transport'
import { Client, LIST_TIMELINE_ENDPOINT } from '../workers/bot/src/timeline/client'
import { dayjs } from '../workers/bot/src/timeline/utils/dayjs'
import { createArchiveProgressRenderer } from './lib/archive-progress'
import {
  ArchiveFailure,
  type ArchiveSource,
  archiveDiagnostic,
  archiveQueryWindow,
  readArchiveScope,
  resolveArchiveScope,
  runArchive
} from './lib/post-archive'
import { assertSeedPathsDisjoint, isPathWithin, readLegacySeedScope } from './lib/post-archive-seed'

const help = `Archive accessible X list search posts without event filtering or external writes.
Usage: bun --no-env-file --env-file=/explicit/path/.dev.vars scripts/archive-list-posts.ts [options]
  --list-id ID      Default: 2019028800869413128
  --from YYYY-MM-DD Default: JST calendar date one year before run start
  --until YYYY-MM-DD Exclusive JST midnight; default: captured run start instant
  --out PATH       Directory under .cache (default: .cache/list-posts/<run timestamp>)
  --seed-from PATH Copy schema2 raw journal into NEW output; inherit exact saved scope
  --resume         Use saved scope and continue from journal; explicit dates/list must match
  --max-pages N    SearchTimeline calls this run (default: 1000)
  --max-requests N SearchTimeline calls this run (default: 1000)
  --delay-ms N     Delay between requests (default: 1500)
  --dry-run        Print resolved scope/query; no credentials required, no network
  --help           Print this help
Environment: TWITTER_AUTH_TOKEN, TWITTER_CSRF_TOKEN; optional TWITTER_BEARER_TOKEN.
Signer discovery makes additional public GET requests outside SearchTimeline budgets.`

const listHelp = `Archive accessible native X List timeline posts without event filtering or external writes.
Usage: bun --no-env-file --env-file=/explicit/path/.dev.vars scripts/archive-list-timeline.ts [options]
  --list-id ID      Default: 2019028800869413128
  --from YYYY-MM-DD Local filter; default: JST date one year before run start
  --until YYYY-MM-DD Exclusive local JST filter; default: captured run start instant
  --out PATH       Directory under .cache (default: .cache/list-timeline/<run timestamp>)
  --resume         Use saved List scope and continue from journal; explicit dates/list must match
  --max-pages N    ListLatestTweetsTimeline calls this run (default: 1000)
  --max-requests N ListLatestTweetsTimeline calls this run (default: 1000)
  --delay-ms N     Minimum request-start interval, including processing (default: 2000)
  --retry-delay-ms N     Initial transient retry delay (default: 5000)
  --max-retry-delay-ms N Exponential retry delay cap (default: 60000)
  --no-retry       Stop on transient failures; resume manually
  --dry-run        Print resolved scope/endpoint; no credentials required, no network
  --help           Print this help
Environment: TWITTER_AUTH_TOKEN, TWITTER_CSRF_TOKEN; optional TWITTER_BEARER_TOKEN.
Dates are filtered locally. Pagination exhaustion does not verify historical coverage.
--seed-from is unsupported. Signer discovery makes public GET requests outside List budgets.`

export const runArchiveCli = async (source: ArchiveSource = 'search') => {
  const started = new Date()
  const parsed = (() => {
    try {
      return parseArgs({
        args: process.argv.slice(2),
        strict: true,
        allowPositionals: false,
        options: {
          'list-id': { type: 'string' },
          from: { type: 'string' },
          until: { type: 'string' },
          out: { type: 'string' },
          'seed-from': { type: 'string' },
          'max-pages': { type: 'string' },
          'max-requests': { type: 'string' },
          'delay-ms': { type: 'string' },
          ...(source === 'list'
            ? {
                'retry-delay-ms': { type: 'string' as const },
                'max-retry-delay-ms': { type: 'string' as const },
                'no-retry': { type: 'boolean' as const }
              }
            : {}),
          resume: { type: 'boolean' },
          'dry-run': { type: 'boolean' },
          help: { type: 'boolean' }
        }
      })
    } catch {
      throw new ArchiveFailure('invalid_params')
    }
  })()
  const flags = new Map(Object.entries(parsed.values))
  if (flags.has('help')) {
    console.log(source === 'list' ? listHelp : help)
    return
  }
  if (source === 'list' && flags.has('seed-from')) throw new ArchiveFailure('invalid_params')
  const value = (key: string) => {
    const result = flags.get(key)
    return typeof result === 'string' ? result : undefined
  }
  const number = (key: string, fallback: number) => {
    const raw = value(key)
    if (raw !== undefined && !/^\d+$/.test(raw)) throw new ArchiveFailure('invalid_params')
    const result = raw === undefined ? fallback : Number(raw)
    const isDelay = key.endsWith('delay-ms')
    if (!Number.isSafeInteger(result) || result < (isDelay ? 0 : 1) || (isDelay && result > 2147483647))
      throw new ArchiveFailure('invalid_params')
    return result
  }
  const cache = resolve('.cache')
  const safePath = async (path: string) => {
    const descendant = relative(cache, path)
    if (!descendant || !isPathWithin(cache, path)) throw new ArchiveFailure('invalid_params')
    let current = cache
    for (const component of ['', ...descendant.split('/')]) {
      if (component) current = resolve(current, component)
      const stat = await lstat(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
        return undefined
      })
      if (stat?.isSymbolicLink()) throw new ArchiveFailure('invalid_params')
      if (stat) {
        const actual = await realpath(current)
        if (!isPathWithin(await realpath('.'), actual)) throw new ArchiveFailure('invalid_params')
      }
    }
    return path
  }
  const namespace = source === 'list' ? 'list-timeline' : 'list-posts'
  const out = await safePath(
    resolve(value('out') ?? `.cache/${namespace}/${started.toISOString().replaceAll(':', '-')}`)
  )
  const rawSeedFrom = value('seed-from')
  const seedFrom = rawSeedFrom === undefined ? undefined : await safePath(resolve(rawSeedFrom))
  const resume = flags.has('resume')
  if (resume && seedFrom) throw new ArchiveFailure('invalid_params')
  if (seedFrom) await assertSeedPathsDisjoint(seedFrom, out)
  const options = { listId: value('list-id'), from: value('from'), until: value('until') }
  const scope = seedFrom
    ? await readLegacySeedScope(seedFrom)
    : resume
      ? await readArchiveScope(out, source)
      : resolveArchiveScope(options, started)
  if (resume || seedFrom) {
    const explicit = resolveArchiveScope(
      {
        listId: options.listId ?? scope.listId,
        from: options.from ?? dayjs(scope.from).format('YYYY-MM-DD'),
        until: options.until
      },
      started
    )
    if (
      (options.listId && options.listId !== scope.listId) ||
      (options.from && explicit.from !== scope.from) ||
      (options.until && explicit.until !== scope.until)
    )
      throw new ArchiveFailure('scope_mismatch')
  }
  const maxPages = number('max-pages', 1000)
  const maxRequests = number('max-requests', 1000)
  const delayMs = number('delay-ms', source === 'list' ? 2000 : 1500)
  const retryOptions =
    source === 'list'
      ? {
          retry: !flags.has('no-retry'),
          retryDelayMs: number('retry-delay-ms', 5000),
          maxRetryDelayMs: number('max-retry-delay-ms', 60000)
        }
      : {}
  if (
    retryOptions.retryDelayMs !== undefined &&
    retryOptions.maxRetryDelayMs !== undefined &&
    retryOptions.maxRetryDelayMs < retryOptions.retryDelayMs
  )
    throw new ArchiveFailure('invalid_params')
  const window = archiveQueryWindow(scope)
  if (flags.has('dry-run')) {
    console.log(
      JSON.stringify(
        {
          ...scope,
          out,
          seedFrom,
          ...(source === 'list'
            ? {
                queryMode: 'list_timeline',
                endpoint: LIST_TIMELINE_ENDPOINT,
                localDateFilter: true,
                coverageVerified: false
              }
            : {}),
          ...retryOptions,
          query:
            source === 'list'
              ? `list:${scope.listId}`
              : `list:${scope.listId} since:${window.since.format('YYYY-MM-DD')} until:${window.until.add(1, 'day').format('YYYY-MM-DD')}`,
          maxPages,
          maxRequests,
          delayMs
        },
        null,
        2
      )
    )
    return
  }
  const progress = createArchiveProgressRenderer({
    write: (value) => {
      process.stderr.write(value)
    },
    isTTY: Boolean(process.stderr.isTTY),
    ansi: process.env.TERM !== 'dumb',
    columns: () => process.stderr.columns
  })
  // A broken progress pipe must not stop collection or leave its output locked.
  process.stderr.on('error', () => progress.disable())
  let result: Awaited<ReturnType<typeof runArchive>>
  try {
    const client = new Client({
      TWITTER_AUTH_TOKEN: process.env.TWITTER_AUTH_TOKEN ?? '',
      TWITTER_CSRF_TOKEN: process.env.TWITTER_CSRF_TOKEN ?? '',
      TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN ?? X_BEARER
    })
    result = await runArchive({
      scope,
      source,
      out,
      resume,
      seedFrom,
      maxPages,
      maxRequests,
      delayMs,
      ...retryOptions,
      search: source === 'list' ? client.listRaw : client.searchRaw,
      onProgress: progress.update
    })
  } finally {
    progress.finish()
  }
  console.log(JSON.stringify({ ...result, out }))
  if (!result.complete) process.exitCode = 2
}

if (import.meta.main)
  runArchiveCli().catch((error) => {
    // Never expose SDK response bodies, cookies, request headers or stack traces.
    console.error(archiveDiagnostic(error))
    process.exitCode = 1
  })
