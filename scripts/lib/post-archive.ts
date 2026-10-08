import { createHash } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Dayjs } from 'dayjs'
import { LIST_TIMELINE_ENDPOINT } from '../../workers/bot/src/timeline/client'
import { dayjs } from '../../workers/bot/src/timeline/utils/dayjs'
import {
  assertSeedPathsDisjoint,
  prepareSeedSnapshot,
  type SeedDescriptor,
  verifySeedSnapshot
} from './post-archive-seed'

export type ArchiveScope = { listId: string; from: string; until: string }
export type ArchiveSource = 'search' | 'list'
export type ScopeOptions = { listId?: string; from?: string; until?: string }
type FailureCode =
  | 'invalid_params'
  | 'locked'
  | 'scope_mismatch'
  | 'missing_journal'
  | 'corrupt_journal'
  | 'output_exists'
const diagnostics: Record<FailureCode, string> = {
  invalid_params: 'Invalid options, dates or bounds. See --help.',
  locked: 'Output is locked. Confirm its owner has stopped before removing only the lock.',
  scope_mismatch: 'Saved scope or policy differs. Preserve this output and use a new directory.',
  missing_journal: 'Required cache data is missing. Preserve the output and inspect the journal.',
  corrupt_journal: 'Cache data is corrupt or out of sequence. Preserve the output and inspect the journal.',
  output_exists: 'Output already contains data. Use --resume or a new directory.'
}
export class ArchiveFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(diagnostics[code])
  }
}
export const archiveDiagnostic = (error: unknown) =>
  error instanceof ArchiveFailure
    ? `Archive failed [${error.code}]: ${diagnostics[error.code]}`
    : 'Archive failed [unexpected]: check credentials, filesystem access and bot README; no automatic retry.'
const exhaustionPolicy = { version: 1, consecutiveReplacementPairs: 3 }
type JsonObject = Record<string, unknown>
const object = (value: unknown): JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unsupported payload')
  return value as JsonObject
}
// Only the observed empty native List dependency failure is safe to request again on explicit resume.
const isListDependencyError = (response: unknown): boolean => {
  const onlyKeys = (value: JsonObject, keys: string[]) =>
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  try {
    const root = object(response)
    if (!onlyKeys(root, ['data', 'errors']) || !Array.isArray(root.errors) || root.errors.length !== 1) return false
    const data = object(root.data)
    const list = object(data.list)
    if (
      !onlyKeys(data, ['list']) ||
      !onlyKeys(list, ['tweets_timeline']) ||
      Object.keys(object(list.tweets_timeline)).length !== 0
    )
      return false
    const error = object(root.errors[0])
    const extensions = object(error.extensions)
    return (
      [error, extensions].every(
        (value) => value.kind === 'Operational' && value.name === 'DependencyError' && value.source === 'Server'
      ) &&
      Array.isArray(error.path) &&
      error.path.length === 3 &&
      error.path.every((part, index) => part === ['list', 'tweets_timeline', 'timeline'][index])
    )
  } catch {
    return false
  }
}
const string = (value: unknown, allowEmpty = false): string => {
  if (typeof value !== 'string' || (!value && !allowEmpty)) throw new Error('Unsupported payload')
  return value
}
const date = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ArchiveFailure('invalid_params')
  const timestamp = new Date(`${value}T00:00:00+09:00`)
  if (!Number.isFinite(timestamp.getTime()) || dayjs(timestamp).format('YYYY-MM-DD') !== value)
    throw new ArchiveFailure('invalid_params')
  return timestamp.toISOString()
}
export const resolveArchiveScope = (options: ScopeOptions, now: Date): ArchiveScope => {
  const today = dayjs(now)
  const scope = {
    listId: options.listId ?? '2019028800869413128',
    from: options.from !== undefined ? date(options.from) : date(today.subtract(1, 'year').format('YYYY-MM-DD')),
    until: options.until !== undefined ? date(options.until) : now.toISOString()
  }
  if (!/^\d+$/.test(scope.listId)) throw new ArchiveFailure('invalid_params')
  if (scope.from >= scope.until || scope.until > now.toISOString()) throw new ArchiveFailure('invalid_params')
  return scope
}
export const archiveQueryWindow = (scope: ArchiveScope) => ({
  since: dayjs(scope.from).startOf('day').subtract(1, 'day'),
  until: dayjs(scope.until).subtract(1, 'millisecond').startOf('day').add(1, 'day')
})
const scopeRecord = (scope: ArchiveScope, seed?: SeedDescriptor, source: ArchiveSource = 'search') => {
  if (source === 'list')
    return {
      schema: 3,
      queryVersion: 1,
      queryMode: 'list_timeline',
      endpoint: LIST_TIMELINE_ENDPOINT,
      count: 20,
      exhaustionPolicy: { version: 1, terminal: 'explicit_bottom_or_no_next_cursor' },
      ...scope,
      query: `list:${scope.listId}`
    }
  const window = archiveQueryWindow(scope)
  return {
    schema: 3,
    queryVersion: 1,
    queryMode: 'single_range',
    product: 'Latest',
    count: 20,
    exhaustionPolicy,
    ...scope,
    ...(seed ? { seed } : {}),
    query: `list:${scope.listId} since:${window.since.format('YYYY-MM-DD')} until:${window.until.add(1, 'day').format('YYYY-MM-DD')}`
  }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const atomic = async (path: string, value: string) => {
  await writeFile(`${path}.tmp`, value, { mode: 0o600 })
  await rename(`${path}.tmp`, path)
}
export const readArchiveScope = async (out: string, expectedSource?: ArchiveSource): Promise<ArchiveScope> => {
  const contents = await readFile(join(out, 'scope.json'), 'utf8').catch(() => {
    throw new ArchiveFailure('missing_journal')
  })
  try {
    const stored = object(JSON.parse(contents))
    if (
      expectedSource &&
      (stored.queryMode !== (expectedSource === 'list' ? 'list_timeline' : 'single_range') ||
        (expectedSource === 'list' && stored.endpoint !== LIST_TIMELINE_ENDPOINT))
    )
      throw new ArchiveFailure('scope_mismatch')
    return { listId: string(stored.listId), from: string(stored.from), until: string(stored.until) }
  } catch (error) {
    if (error instanceof ArchiveFailure) throw error
    throw new ArchiveFailure('corrupt_journal')
  }
}

type ArchivedPost = {
  id: string
  createdAt: string
  text: string
  author: { id?: string; name: string; screenName: string }
  replyToStatusId?: string
  replyToUserId?: string
  hashtags: string[]
  url: string
  raw: unknown
}
export const parseArchivePage = (response: unknown, source: ArchiveSource = 'search') => {
  const posts: ArchivedPost[] = []
  const cursors: string[] = []
  const root = object(response)
  if (root.errors) throw new Error('Unsupported payload')
  const data = object(root.data)
  const timeline =
    source === 'list'
      ? object(object(object(data.list).tweets_timeline).timeline)
      : object(object(object(data.search_by_raw_query).search_timeline).timeline)
  if (!Array.isArray(timeline.instructions)) throw new Error('Unsupported payload')
  const instructions = timeline.instructions
  let recognized = false
  let terminated = false
  let topLevelOldestTimestamp: string | undefined
  const visit = (value: unknown, topLevel = false): void => {
    const entry = object(value)
    const content = object(entry.content ?? entry.item ?? entry)
    if (content.cursorType) {
      string(content.value)
      if (content.cursorType === 'Bottom') cursors.push(string(content.value))
      else if (content.cursorType !== 'Top') throw new Error('Unsupported cursor')
      return
    }
    if (Array.isArray(content.items)) {
      for (const item of content.items) visit(item)
      return
    }
    const item = object(content.itemContent ?? content)
    const original = object(object(item.tweet_results).result)
    const result = original.__typename === 'TweetWithVisibilityResults' ? object(original.tweet) : original
    if (result.__typename && result.__typename !== 'Tweet') throw new Error('Inaccessible tweet')
    const legacy = object(result.legacy)
    const user = object(object(object(result.core).user_results).result)
    const userCore = object(user.core ?? user.legacy)
    const id = string(legacy.id_str)
    if (!/^\d+$/.test(id)) throw new Error('Unsupported tweet ID')
    const created = new Date(string(legacy.created_at))
    if (!Number.isFinite(created.getTime())) throw new Error('Unsupported timestamp')
    const createdAt = created.toISOString()
    if (topLevel)
      topLevelOldestTimestamp =
        topLevelOldestTimestamp && topLevelOldestTimestamp < createdAt ? topLevelOldestTimestamp : createdAt
    let text = string(legacy.full_text, true)
    if (result.note_tweet) text = string(object(object(object(result.note_tweet).note_tweet_results).result).text)
    const screenName = string(userCore.screen_name)
    const entities = legacy.entities ? object(legacy.entities) : {}
    const hashtags = entities.hashtags ?? []
    if (!Array.isArray(hashtags)) throw new Error('Unsupported hashtags')
    posts.push({
      id,
      createdAt,
      text,
      author: {
        ...(typeof user.rest_id === 'string' ? { id: user.rest_id } : {}),
        name: string(userCore.name, true),
        screenName
      },
      ...(typeof legacy.in_reply_to_status_id_str === 'string'
        ? { replyToStatusId: legacy.in_reply_to_status_id_str }
        : {}),
      ...(typeof legacy.in_reply_to_user_id_str === 'string' ? { replyToUserId: legacy.in_reply_to_user_id_str } : {}),
      hashtags: hashtags.map((tag) => string(object(tag).text)),
      url: `https://x.com/${screenName}/status/${id}`,
      raw: original
    })
  }
  for (const raw of instructions) {
    const instruction = object(raw)
    if (Array.isArray(instruction.entries) && (!instruction.type || instruction.type === 'TimelineAddEntries')) {
      recognized = true
      for (const entry of instruction.entries) visit(entry, true)
    } else if (instruction.type === 'TimelineReplaceEntry' && instruction.entry) {
      recognized = true
      visit(instruction.entry, true)
    } else if (instruction.type === 'TimelineAddToModule' && Array.isArray(instruction.moduleItems)) {
      recognized = true
      for (const item of instruction.moduleItems) visit(item)
    } else if (
      instruction.type === 'TimelineTerminateTimeline' &&
      ['Bottom', 'Top'].includes(String(instruction.direction))
    ) {
      if (instruction.direction === 'Bottom') {
        recognized = true
        terminated = true
      }
    } else if (instruction.type !== 'TimelineClearCache') throw new Error('Unsupported instruction')
  }
  if (!recognized || cursors.length > 1) throw new Error('Unsupported payload')
  const replacementPair =
    instructions.length === 2 &&
    ['Top', 'Bottom'].every((direction) => {
      const id = direction === 'Top' ? 'cursor-top-9223372036854775807' : 'cursor-bottom-0'
      return instructions.some((raw) => {
        const instruction = object(raw)
        if (instruction.type !== 'TimelineReplaceEntry') return false
        const entry = object(instruction.entry)
        const content = object(entry.content)
        return (
          instruction.entry_id_to_replace === id &&
          entry.entryId === id &&
          content.cursorType === direction &&
          content.entryType === 'TimelineTimelineCursor' &&
          content.__typename === 'TimelineTimelineCursor' &&
          !content.itemContent &&
          !content.items &&
          !content.tweet_results
        )
      })
    })
  return {
    posts,
    nextCursor: terminated ? undefined : cursors[0],
    terminated,
    replacementPair,
    topLevelOldestTimestamp
  }
}

type Reason =
  | 'search_exhausted'
  | 'list_exhausted'
  | 'budget'
  | 'request_failed'
  | 'unsupported_payload'
  | 'repeated_cursor'
  | 'non_advancing'
export type ArchiveResult = {
  complete: boolean
  reason: Reason
  pages: number
  posts: number
  seedPages: number
  seedMatchedByQuery: number
  seedOnlyPosts: number
  terminalReason?: string
  coverageVerified: false
  queryOldestTimestamp?: string
  topLevelOldestTimestamp?: string
  retriesThisRun?: number
  requestFailure?: { kind: string; status?: number }
}
export type ArchiveAccount = { key: string; authorId?: string; screenName: string; posts: number }
export type ArchiveRetry = { attempt: number; delayMs: number; kind: string }
export type ArchiveProgress = {
  date: string
  pages: number
  seedPages: number
  posts: number
  status: 'running' | 'retrying' | Reason
  retry?: ArchiveRetry
  accounts: ArchiveAccount[]
}
type Envelope = {
  version: 2
  scopeFingerprint: string
  index: number
  query: string
  requestCursor?: string
  response: unknown
}
type RowIndex = {
  id: string
  createdAt: string
  author: { id?: string; screenName: string }
  location: string
  position: number
}
export const runArchive = async (options: {
  scope: ArchiveScope
  source?: ArchiveSource
  out: string
  seedFrom?: string
  resume?: boolean
  maxPages?: number
  maxRequests?: number
  delayMs?: number
  retry?: boolean
  retryDelayMs?: number
  maxRetryDelayMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  nowMs?: () => number
  onProgress?: (snapshot: ArchiveProgress) => void | Promise<void>
  search: (params: { cursor?: string; listId: string; since: Dayjs; until: Dayjs }) => Promise<unknown>
}): Promise<ArchiveResult> => {
  const { scope, out } = options
  const source = options.source ?? 'search'
  const maxPages = options.maxPages ?? 1000
  const maxRequests = options.maxRequests ?? 1000
  const delayMs = options.delayMs ?? (source === 'list' ? 2000 : 1500)
  const nowMs = options.nowMs ?? (() => performance.now())
  const retry = source === 'list' && options.retry !== false
  const retryDelayMs = options.retryDelayMs ?? 5000
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 60000
  const sleep =
    options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  for (const value of [maxPages, maxRequests])
    if (!Number.isSafeInteger(value) || value < 1) throw new ArchiveFailure('invalid_params')
  if (
    !Number.isSafeInteger(delayMs) ||
    delayMs < 0 ||
    delayMs > 2147483647 ||
    (options.resume && options.seedFrom) ||
    (source === 'list' && options.seedFrom)
  )
    throw new ArchiveFailure('invalid_params')
  if (
    source === 'list' &&
    (![retryDelayMs, maxRetryDelayMs].every(
      (value) => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647
    ) ||
      maxRetryDelayMs < retryDelayMs)
  )
    throw new ArchiveFailure('invalid_params')
  if (options.seedFrom) await assertSeedPathsDisjoint(options.seedFrom, out)
  await mkdir(out, { recursive: true, mode: 0o700 })
  const lock = await open(join(out, '.lock'), 'wx', 0o600).catch(() => {
    throw new ArchiveFailure('locked')
  })
  try {
    let seed: SeedDescriptor | undefined
    if (options.resume) {
      const persisted = await readFile(join(out, 'scope.json'), 'utf8').catch(() => {
        throw new ArchiveFailure('missing_journal')
      })
      try {
        seed = object(JSON.parse(persisted)).seed as SeedDescriptor | undefined
      } catch {
        throw new ArchiveFailure('corrupt_journal')
      }
      if (persisted !== JSON.stringify(scopeRecord(scope, seed, source))) throw new ArchiveFailure('scope_mismatch')
      if (seed) await verifySeedSnapshot(join(out, 'seed'), seed, scope)
    } else {
      if ((await readdir(out)).some((name) => name !== '.lock')) throw new ArchiveFailure('output_exists')
      if (options.seedFrom) seed = await prepareSeedSnapshot(options.seedFrom, out, scope)
      await atomic(join(out, 'scope.json'), JSON.stringify(scopeRecord(scope, seed, source)))
    }
    const record = scopeRecord(scope, seed, source)
    const fingerprint = hash(record)
    const query = record.query
    await mkdir(join(out, 'pages'), { recursive: true, mode: 0o700 })
    const rows = new Map<string, RowIndex>()
    const accountCounts = new Map<string, ArchiveAccount>()
    const locations: string[] = []
    const seedIds = new Set<string>()
    const querySeenIds = new Set<string>()
    const seedMatched = new Set<string>()
    const accountKey = (post: Pick<RowIndex, 'author'>) =>
      post.author.id ? `id:${post.author.id}` : `handle:${post.author.screenName.toLowerCase()}`
    const savePost = (post: ArchivedPost, location: string, position: number) => {
      const previous = rows.get(post.id)
      if (previous) {
        const key = accountKey(previous)
        const account = accountCounts.get(key)
        if (account) {
          account.posts--
          if (!account.posts) accountCounts.delete(key)
        }
      }
      rows.set(post.id, {
        id: post.id,
        createdAt: post.createdAt,
        author: { id: post.author.id, screenName: post.author.screenName },
        location,
        position
      })
      const key = accountKey(post)
      const account = accountCounts.get(key)
      accountCounts.set(key, {
        key,
        ...(post.author.id ? { authorId: post.author.id } : {}),
        screenName: post.author.screenName.toLowerCase(),
        posts: (account?.posts ?? 0) + 1
      })
    }
    const accounts = () =>
      [...accountCounts.values()]
        .map((value) => ({ ...value }))
        .sort((a, b) => b.posts - a.posts || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    const inScope = (post: ArchivedPost) => post.createdAt >= scope.from && post.createdAt < scope.until
    let pages = 0
    let requests = 0
    let nextCursor: string | undefined
    let empty = 0
    let reason: Reason | undefined
    let terminalReason: string | undefined
    let queryOldestTimestamp: string | undefined
    let minTimestamp: string | undefined
    let maxTimestamp: string | undefined
    let topLevelOldestTimestamp: string | undefined
    const exhausted = () => reason === 'search_exhausted' || reason === 'list_exhausted'
    let outsideWindow = 0
    let requestFailure: { kind: string; status?: number } | undefined
    let retriesThisRun = 0
    let consecutiveFailures = 0
    let backoffMs = retryDelayMs
    let pendingRetry: ArchiveRetry | undefined
    let lastListDispatchStart: number | undefined
    const remainingListInterval = () =>
      lastListDispatchStart === undefined ? 0 : Math.max(0, delayMs - (nowMs() - lastListDispatchStart))
    const scheduleRetry = (hint?: number) => {
      if (!retry) {
        reason = 'request_failed'
        return
      }
      if (requests >= maxPages || requests >= maxRequests) {
        reason = 'budget'
        return
      }
      consecutiveFailures++
      pendingRetry = {
        attempt: consecutiveFailures,
        delayMs: Math.max(backoffMs, hint ?? 0, requestFailure?.status === 429 ? 60000 : 0, remainingListInterval()),
        kind: requestFailure?.kind ?? 'unknown'
      }
      backoffMs = Math.min(maxRetryDelayMs, backoffMs * 2)
    }
    const cursors = new Set<string>()
    if (seed)
      for (const file of seed.files.filter((file) => file.name.startsWith('pages/'))) {
        const location = `seed/${file.name}`
        locations.push(location)
        const envelope = JSON.parse(await readFile(join(out, location), 'utf8'))
        for (const [position, post] of parseArchivePage(envelope.response).posts.entries())
          if (inScope(post)) {
            seedIds.add(post.id)
            savePost(post, location, position)
          }
      }
    const processPage = (envelope: Envelope, location: string) => {
      if (
        envelope?.version !== 2 ||
        envelope.scopeFingerprint !== fingerprint ||
        envelope.index !== pages + 1 ||
        envelope.query !== query ||
        envelope.requestCursor !== nextCursor
      )
        throw new ArchiveFailure('corrupt_journal')
      pages++
      locations.push(location)
      if (source === 'list' && isListDependencyError(envelope.response)) return 'list_dependency'
      let parsed: ReturnType<typeof parseArchivePage>
      try {
        parsed = parseArchivePage(envelope.response, source)
      } catch {
        reason = 'unsupported_payload'
        return
      }
      if (parsed.topLevelOldestTimestamp)
        topLevelOldestTimestamp =
          topLevelOldestTimestamp && topLevelOldestTimestamp < parsed.topLevelOldestTimestamp
            ? topLevelOldestTimestamp
            : parsed.topLevelOldestTimestamp
      let newIds = 0
      for (const [position, post] of parsed.posts.entries()) {
        if (!querySeenIds.has(post.id)) {
          querySeenIds.add(post.id)
          newIds++
        }
        minTimestamp = minTimestamp && minTimestamp < post.createdAt ? minTimestamp : post.createdAt
        maxTimestamp = maxTimestamp && maxTimestamp > post.createdAt ? maxTimestamp : post.createdAt
        if (inScope(post)) {
          savePost(post, location, position)
          if (seedIds.has(post.id)) seedMatched.add(post.id)
          queryOldestTimestamp =
            queryOldestTimestamp && queryOldestTimestamp < post.createdAt ? queryOldestTimestamp : post.createdAt
        } else outsideWindow++
      }
      empty = envelope.requestCursor && parsed.replacementPair ? empty + 1 : 0
      if (parsed.nextCursor && cursors.has(parsed.nextCursor)) reason = 'repeated_cursor'
      else if (source === 'search' && parsed.nextCursor && pages > 1 && parsed.posts.length > 0 && newIds === 0)
        reason = 'non_advancing'
      else if (!parsed.nextCursor || (source === 'search' && empty >= 3)) {
        terminalReason = parsed.terminated
          ? 'explicit_bottom'
          : parsed.nextCursor
            ? 'confirmed_cursor_only'
            : 'no_next_cursor'
        reason = source === 'list' ? 'list_exhausted' : 'search_exhausted'
      }
      if (parsed.nextCursor) cursors.add(parsed.nextCursor)
      nextCursor = exhausted() ? undefined : parsed.nextCursor
    }
    const names = (await readdir(join(out, 'pages')))
      .filter((name) => name !== '.DS_Store' && !name.endsWith('.tmp'))
      .sort()
    const previous = await readFile(join(out, 'checkpoint.json'), 'utf8')
      .then((value) => {
        try {
          return object(JSON.parse(value))
        } catch {
          return undefined
        }
      })
      .catch(() => undefined)
    if (previous && typeof previous.pages === 'number' && previous.pages > names.length)
      throw new ArchiveFailure('missing_journal')
    for (const [index, name] of names.entries()) {
      if (name !== `${String(index + 1).padStart(6, '0')}.json` || reason) throw new ArchiveFailure('corrupt_journal')
      let envelope: Envelope
      try {
        envelope = JSON.parse(await readFile(join(out, 'pages', name), 'utf8'))
      } catch {
        throw new ArchiveFailure('corrupt_journal')
      }
      processPage(envelope, `pages/${name}`)
    }
    const emit = () => {
      if (!options.onProgress) return
      try {
        void Promise.resolve(
          options.onProgress({
            date: (source === 'list' ? topLevelOldestTimestamp : minTimestamp)
              ? dayjs(source === 'list' ? topLevelOldestTimestamp : minTimestamp).format('YYYY-MM-DD')
              : '-',
            pages,
            seedPages: seed?.pages ?? 0,
            posts: rows.size,
            status: reason ?? (pendingRetry ? 'retrying' : 'running'),
            ...(pendingRetry ? { retry: { ...pendingRetry } } : {}),
            accounts: accounts()
          })
        ).catch(() => {})
      } catch {
        /* Display-only failure. */
      }
    }
    const save = async (materialize = false) => {
      if (materialize) {
        const path = join(out, 'posts.jsonl')
        const file = await open(`${path}.tmp`, 'w', 0o600)
        let emitted = 0
        try {
          for (const location of locations) {
            const envelope = JSON.parse(await readFile(join(out, location), 'utf8'))
            let posts: ArchivedPost[]
            try {
              posts = parseArchivePage(envelope.response, source).posts
            } catch {
              continue
            }
            for (const [position, post] of posts.entries()) {
              const selected = rows.get(post.id)
              if (selected?.location === location && selected.position === position) {
                await file.writeFile(`${JSON.stringify(post)}\n`)
                emitted++
              }
            }
          }
        } finally {
          await file.close()
        }
        if (emitted !== rows.size) throw new ArchiveFailure('corrupt_journal')
        await rename(`${path}.tmp`, path)
      }
      await atomic(join(out, 'checkpoint.json'), JSON.stringify({ scopeFingerprint: fingerprint, pages, nextCursor }))
      await atomic(
        join(out, 'manifest.json'),
        JSON.stringify(
          {
            ...record,
            scopeFingerprint: fingerprint,
            complete: exhausted(),
            reason: reason ?? 'budget',
            coverageVerified: false,
            terminalReason,
            pages,
            seedPages: seed?.pages ?? 0,
            posts: rows.size,
            accounts: accounts(),
            requestsThisRun: requests,
            outsideWindow,
            minTimestamp,
            maxTimestamp,
            queryOldestTimestamp,
            ...(source === 'list'
              ? { topLevelOldestTimestamp, retriesThisRun, ...(pendingRetry ? { retry: pendingRetry } : {}) }
              : {}),
            seedMatchedByQuery: seedMatched.size,
            seedOnlyPosts: seedIds.size - seedMatched.size,
            requestFailure,
            coverage:
              source === 'list'
                ? 'Native List pagination ended only at explicit Bottom or no next cursor. Dates were filtered locally. Historical coverage and timeline ordering have not been verified.'
                : 'One fixed SearchTimeline range ended under the recorded empirical cursor policy. Historical coverage has not been verified; seeded posts may not reappear in the new query.'
          },
          null,
          2
        )
      )
      emit()
    }
    await save(true)
    while (!reason && requests < maxPages && requests < maxRequests) {
      emit()
      if (pendingRetry) {
        await sleep(pendingRetry.delayMs)
        retriesThisRun++
        pendingRetry = undefined
      } else if (source === 'list') {
        const remaining = remainingListInterval()
        if (remaining > 0) await sleep(remaining)
      } else if (requests > 0 || pages > 0) await sleep(delayMs)
      requests++
      let response: unknown
      try {
        if (source === 'list') lastListDispatchStart = nowMs()
        response = await options.search({ ...archiveQueryWindow(scope), listId: scope.listId, cursor: nextCursor })
      } catch (error) {
        requestFailure = { kind: 'unknown' }
        let retryable = false
        let retryAfterMs: number | undefined
        if (error && typeof error === 'object') {
          try {
            const kind = Object.getOwnPropertyDescriptor(error, 'kind')?.value
            const statusDescriptor = Object.getOwnPropertyDescriptor(error, 'status')
            const status = statusDescriptor?.value
            requestFailure = {
              kind:
                typeof kind === 'string' && ['configuration', 'signature', 'rate_limited', 'timeline'].includes(kind)
                  ? kind
                  : 'unknown',
              ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
                ? { status }
                : {})
            }
            const transient = Object.getOwnPropertyDescriptor(error, 'transient')?.value === true
            const statusIsData = !statusDescriptor || Object.hasOwn(statusDescriptor, 'value')
            retryable =
              statusIsData &&
              (((kind === 'timeline' || kind === 'rate_limited') && [408, 429, 500, 502, 503, 504].includes(status)) ||
                ((kind === 'timeline' || kind === 'signature') && status === undefined && transient))
            const hint = Object.getOwnPropertyDescriptor(error, 'retryAfterMs')?.value
            if (typeof hint === 'number' && Number.isSafeInteger(hint) && hint > 0 && hint <= 86400000)
              retryAfterMs = hint
          } catch {
            /* Error getters/proxies are not a diagnostic source. */
          }
        }
        if (retry && retryable) {
          scheduleRetry(retryAfterMs)
          await save()
          continue
        }
        reason = 'request_failed'
        break
      }
      const envelope: Envelope = {
        version: 2,
        scopeFingerprint: fingerprint,
        index: pages + 1,
        query,
        requestCursor: nextCursor,
        response
      }
      const location = `pages/${String(pages + 1).padStart(6, '0')}.json`
      await atomic(join(out, location), JSON.stringify(envelope))
      if (processPage(envelope, location) === 'list_dependency') {
        requestFailure = { kind: 'list_dependency' }
        scheduleRetry()
      } else if (source === 'list') {
        requestFailure = undefined
        backoffMs = retryDelayMs
        consecutiveFailures = 0
      }
      await save()
    }
    reason ??= 'budget'
    await save(true)
    return {
      complete: exhausted(),
      reason,
      pages,
      posts: rows.size,
      seedPages: seed?.pages ?? 0,
      seedMatchedByQuery: seedMatched.size,
      seedOnlyPosts: seedIds.size - seedMatched.size,
      terminalReason,
      coverageVerified: false,
      queryOldestTimestamp,
      ...(source === 'list' ? { topLevelOldestTimestamp, retriesThisRun } : {}),
      requestFailure
    }
  } finally {
    await lock.close()
    await rm(join(out, '.lock'))
  }
}
