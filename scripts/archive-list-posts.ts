import { isAbsolute, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { X_BEARER } from '@biccame/shared/x/transport'
import { Client } from '../workers/bot/src/timeline/client'
import { dayjs } from '../workers/bot/src/timeline/utils/dayjs'
import {
  archiveQueryWindow,
  archiveSlices,
  readArchiveScope,
  resolveArchiveScope,
  runArchive
} from './lib/post-archive'

const help = `Archive accessible X list search posts without event filtering or external writes.
Usage: bun --no-env-file --env-file=/explicit/path/.dev.vars scripts/archive-list-posts.ts [options]
  --list-id ID      Default: 2019028800869413128
  --from YYYY-MM-DD Default: JST calendar date one year before run start
  --until YYYY-MM-DD Exclusive JST midnight; default: captured run start instant
  --out PATH       Directory under .cache (default: .cache/list-posts/<run timestamp>)
  --resume         Use saved scope and continue from journal; explicit dates/list must match
  --max-pages N    SearchTimeline calls this run (default: 1000)
  --max-requests N SearchTimeline calls this run (default: 1000)
  --delay-ms N     Delay between requests (default: 1500)
  --dry-run        Print resolved scope/query; no credentials required, no network
  --help           Print this help
Environment: TWITTER_AUTH_TOKEN, TWITTER_CSRF_TOKEN; optional TWITTER_BEARER_TOKEN.
Signer discovery makes additional public GET requests outside SearchTimeline budgets.`

const main = async () => {
  const started = new Date()
  const parsed = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: false,
    options: {
      'list-id': { type: 'string' },
      from: { type: 'string' },
      until: { type: 'string' },
      out: { type: 'string' },
      'max-pages': { type: 'string' },
      'max-requests': { type: 'string' },
      'delay-ms': { type: 'string' },
      resume: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean' }
    }
  })
  const flags = new Map(Object.entries(parsed.values))
  if (flags.has('help')) {
    console.log(help)
    return
  }
  const value = (key: string) => {
    const result = flags.get(key)
    return typeof result === 'string' ? result : undefined
  }
  const number = (key: string, fallback: number) => {
    const raw = value(key)
    if (raw !== undefined && !/^\d+$/.test(raw)) throw new Error('Invalid numeric option')
    const result = raw === undefined ? fallback : Number(raw)
    if (!Number.isSafeInteger(result) || result < (key === 'delay-ms' ? 0 : 1))
      throw new Error('Invalid numeric option')
    return result
  }
  const cache = resolve('.cache')
  const out = resolve(value('out') ?? `.cache/list-posts/${started.toISOString().replaceAll(':', '-')}`)
  const descendant = relative(cache, out)
  if (!descendant || descendant.startsWith('..') || isAbsolute(descendant))
    throw new Error('Output must be under .cache')
  const options = { listId: value('list-id'), from: value('from'), until: value('until') }
  const resume = flags.has('resume')
  const scope = resume ? await readArchiveScope(out) : resolveArchiveScope(options, started)
  if (resume) {
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
      throw new Error('Resume scope mismatch')
  }
  const maxPages = number('max-pages', 1000)
  const maxRequests = number('max-requests', 1000)
  const delayMs = number('delay-ms', 1500)
  const slices = archiveSlices(scope)
  const window = archiveQueryWindow(slices[0])
  if (flags.has('dry-run')) {
    console.log(
      JSON.stringify(
        {
          ...scope,
          out,
          daySlices: slices.length,
          firstQuery: `list:${scope.listId} since:${window.since.format('YYYY-MM-DD')} until:${window.until.add(1, 'day').format('YYYY-MM-DD')}`,
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
  const client = new Client({
    TWITTER_AUTH_TOKEN: process.env.TWITTER_AUTH_TOKEN ?? '',
    TWITTER_CSRF_TOKEN: process.env.TWITTER_CSRF_TOKEN ?? '',
    TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN ?? X_BEARER
  })
  const result = await runArchive({ scope, out, resume, maxPages, maxRequests, delayMs, search: client.searchRaw })
  console.log(JSON.stringify({ ...result, out }))
  if (!result.complete) process.exitCode = 2
}

if (import.meta.main)
  main().catch(() => {
    // Never expose SDK response bodies, cookies, request headers or stack traces.
    console.error(
      'Archive failed: check options, credentials, output lock and cache integrity. See --help and bot README.'
    )
    process.exitCode = 1
  })
