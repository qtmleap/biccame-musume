import { createHash } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Dayjs } from 'dayjs'
import { dayjs } from '../../workers/bot/src/timeline/utils/dayjs'

export type ArchiveScope = { listId: string; from: string; until: string }
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
const scopeRecord = (scope: ArchiveScope) => {
  const window = archiveQueryWindow(scope)
  return {
    schema: 2,
    queryVersion: 1,
    queryMode: 'jst_calendar_days',
    product: 'Latest',
    count: 20,
    exhaustionPolicy,
    ...scope,
    query: `list:${scope.listId} since:${window.since.format('YYYY-MM-DD')} until:${window.until.add(1, 'day').format('YYYY-MM-DD')}`
  }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const atomic = async (path: string, value: string) => {
  await writeFile(`${path}.tmp`, value, { mode: 0o600 })
  await rename(`${path}.tmp`, path)
}
export const readArchiveScope = async (out: string): Promise<ArchiveScope> => {
  const contents = await readFile(join(out, 'scope.json'), 'utf8').catch(() => {
    throw new ArchiveFailure('missing_journal')
  })
  try {
    const stored = object(JSON.parse(contents))
    return { listId: string(stored.listId), from: string(stored.from), until: string(stored.until) }
  } catch {
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
export const parseArchivePage = (response: unknown) => {
  const posts: ArchivedPost[] = []
  const cursors: string[] = []
  const root = object(response)
  if (root.errors) throw new Error('Unsupported payload')
  const timeline = object(object(object(object(root.data).search_by_raw_query).search_timeline).timeline)
  if (!Array.isArray(timeline.instructions)) throw new Error('Unsupported payload')
  const instructions = timeline.instructions
  let recognized = false
  let terminated = false
  const visit = (value: unknown): void => {
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
    let text = string(legacy.full_text, true)
    if (result.note_tweet) text = string(object(object(object(result.note_tweet).note_tweet_results).result).text)
    const screenName = string(userCore.screen_name)
    const entities = legacy.entities ? object(legacy.entities) : {}
    const hashtags = entities.hashtags ?? []
    if (!Array.isArray(hashtags)) throw new Error('Unsupported hashtags')
    posts.push({
      id,
      createdAt: created.toISOString(),
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
      for (const entry of instruction.entries) visit(entry)
    } else if (instruction.type === 'TimelineReplaceEntry' && instruction.entry) {
      recognized = true
      visit(instruction.entry)
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
  return { posts, nextCursor: terminated ? undefined : cursors[0], terminated, replacementPair }
}

type Reason =
  | 'search_exhausted'
  | 'budget'
  | 'request_failed'
  | 'unsupported_payload'
  | 'repeated_cursor'
  | 'non_advancing'
export type ArchiveResult = { complete: boolean; reason: Reason; pages: number; posts: number }
export type ArchiveAccount = { key: string; authorId?: string; screenName: string; posts: number }
export type ArchiveProgress = {
  date: string
  completedDays: number
  totalDays: number
  pages: number
  posts: number
  status: 'running' | Reason
  accounts: ArchiveAccount[]
}
export const archiveSlices = (scope: ArchiveScope): ArchiveScope[] => {
  const slices: ArchiveScope[] = []
  let from = scope.from
  while (from < scope.until) {
    const next = dayjs(from).startOf('day').add(1, 'day').toISOString()
    const until = next < scope.until ? next : scope.until
    slices.push({ ...scope, from, until })
    from = until
  }
  return slices
}
const queryFor = (scope: ArchiveScope) => {
  const window = archiveQueryWindow(scope)
  return `list:${scope.listId} since:${window.since.format('YYYY-MM-DD')} until:${window.until.add(1, 'day').format('YYYY-MM-DD')}`
}
type Envelope = {
  version: number
  scopeFingerprint: string
  index: number
  sliceIndex: number
  query: string
  requestCursor?: string
  response: unknown
}
export const runArchive = async (options: {
  scope: ArchiveScope
  out: string
  resume?: boolean
  maxPages?: number
  maxRequests?: number
  delayMs?: number
  onProgress?: (snapshot: ArchiveProgress) => void | Promise<void>
  search: (params: { cursor?: string; listId: string; since: Dayjs; until: Dayjs }) => Promise<unknown>
}): Promise<ArchiveResult> => {
  const { scope, out } = options
  const maxPages = options.maxPages ?? 1000
  const maxRequests = options.maxRequests ?? 1000
  const delayMs = options.delayMs ?? 1500
  for (const value of [maxPages, maxRequests])
    if (!Number.isSafeInteger(value) || value < 1) throw new ArchiveFailure('invalid_params')
  if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 2147483647) throw new ArchiveFailure('invalid_params')
  await mkdir(out, { recursive: true, mode: 0o700 })
  const lock = await open(join(out, '.lock'), 'wx', 0o600).catch(() => {
    throw new ArchiveFailure('locked')
  })
  try {
    const record = scopeRecord(scope)
    const fingerprint = hash(record)
    if (options.resume) {
      const persisted = await readFile(join(out, 'scope.json'), 'utf8').catch(() => {
        throw new ArchiveFailure('missing_journal')
      })
      if (persisted !== JSON.stringify(record)) throw new ArchiveFailure('scope_mismatch')
    } else {
      if ((await readdir(out)).some((name) => name !== '.lock')) throw new ArchiveFailure('output_exists')
      await atomic(join(out, 'scope.json'), JSON.stringify(record))
    }
    await mkdir(join(out, 'pages'), { recursive: true, mode: 0o700 })
    const rows = new Map<string, ArchivedPost>()
    const accountCounts = new Map<string, ArchiveAccount>()
    const accountKey = (post: ArchivedPost) =>
      post.author.id ? `id:${post.author.id}` : `handle:${post.author.screenName.toLowerCase()}`
    const savePost = (post: ArchivedPost) => {
      const previous = rows.get(post.id)
      if (previous) {
        const key = accountKey(previous)
        const account = accountCounts.get(key)
        if (account) {
          account.posts--
          if (!account.posts) accountCounts.delete(key)
        }
      }
      rows.set(post.id, post)
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
        .map((account) => ({ ...account }))
        .sort((a, b) => b.posts - a.posts || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    const dayIds = new Set<string>()
    const slices = archiveSlices(scope)
    const days: (ArchiveScope & {
      complete: boolean
      pages: number
      inWindowPosts: number
      minTimestamp?: string
      maxTimestamp?: string
      terminalReason?: string
    })[] = slices.map((slice) => ({
      ...slice,
      complete: false,
      pages: 0,
      inWindowPosts: 0
    }))
    let sliceIndex = 0
    let lastPageSlice = 0
    const seenCursors = new Set<string>()
    let nextCursor: string | undefined
    let pages = 0
    let requests = 0
    let cursorOnlyStreak = 0
    let reason: Reason | undefined
    let outsideWindow = 0
    let minTimestamp: string | undefined
    let maxTimestamp: string | undefined
    const processPage = (envelope: Envelope) => {
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))
        throw new ArchiveFailure('corrupt_journal')
      if (
        envelope.version !== 1 ||
        envelope.scopeFingerprint !== fingerprint ||
        envelope.index !== pages + 1 ||
        envelope.sliceIndex !== sliceIndex ||
        envelope.query !== queryFor(slices[sliceIndex]) ||
        envelope.requestCursor !== nextCursor
      )
        throw new ArchiveFailure('corrupt_journal')
      pages++
      lastPageSlice = sliceIndex
      days[sliceIndex].pages++
      let parsed: ReturnType<typeof parseArchivePage>
      try {
        parsed = parseArchivePage(envelope.response)
      } catch {
        reason = 'unsupported_payload'
        return
      }
      let newIds = 0
      for (const post of parsed.posts) {
        const isNew = !dayIds.has(post.id)
        if (!dayIds.has(post.id)) {
          dayIds.add(post.id)
          newIds++
        }
        minTimestamp = minTimestamp && minTimestamp < post.createdAt ? minTimestamp : post.createdAt
        maxTimestamp = maxTimestamp && maxTimestamp > post.createdAt ? maxTimestamp : post.createdAt
        if (post.createdAt >= slices[sliceIndex].from && post.createdAt < slices[sliceIndex].until) {
          savePost(post)
          const day = days[sliceIndex]
          if (isNew) day.inWindowPosts++
          day.minTimestamp = day.minTimestamp && day.minTimestamp < post.createdAt ? day.minTimestamp : post.createdAt
          day.maxTimestamp = day.maxTimestamp && day.maxTimestamp > post.createdAt ? day.maxTimestamp : post.createdAt
        } else outsideWindow++
      }
      cursorOnlyStreak = envelope.requestCursor && parsed.replacementPair ? cursorOnlyStreak + 1 : 0
      const terminal = !parsed.nextCursor || cursorOnlyStreak >= exhaustionPolicy.consecutiveReplacementPairs
      if (parsed.nextCursor && seenCursors.has(parsed.nextCursor)) reason = 'repeated_cursor'
      else if (parsed.nextCursor && days[sliceIndex].pages > 1 && parsed.posts.length > 0 && newIds === 0)
        reason = 'non_advancing'
      else if (terminal) {
        days[sliceIndex].complete = true
        days[sliceIndex].terminalReason = parsed.terminated
          ? 'explicit_bottom'
          : parsed.nextCursor
            ? 'confirmed_cursor_only'
            : 'no_next_cursor'
        sliceIndex++
        dayIds.clear()
        seenCursors.clear()
        cursorOnlyStreak = 0
        if (sliceIndex === slices.length) reason = 'search_exhausted'
      }
      const completedDay = terminal && (!reason || reason === 'search_exhausted')
      if (!completedDay && parsed.nextCursor) seenCursors.add(parsed.nextCursor)
      nextCursor = completedDay ? undefined : parsed.nextCursor
    }
    const names = (await readdir(join(out, 'pages')))
      .filter((name) => name !== '.DS_Store' && !name.endsWith('.tmp'))
      .sort()
    const previousCheckpoint = await readFile(join(out, 'checkpoint.json'), 'utf8')
      .then((value) => {
        try {
          return object(JSON.parse(value))
        } catch {
          return undefined
        }
      })
      .catch(() => undefined)
    if (previousCheckpoint && typeof previousCheckpoint.pages === 'number' && previousCheckpoint.pages > names.length)
      throw new ArchiveFailure('missing_journal')
    for (const [index, name] of names.entries()) {
      if (name !== `${String(index + 1).padStart(6, '0')}.json` || reason) throw new ArchiveFailure('corrupt_journal')
      let envelope: Envelope
      try {
        envelope = JSON.parse(await readFile(join(out, 'pages', name), 'utf8'))
      } catch {
        throw new ArchiveFailure('corrupt_journal')
      }
      processPage(envelope)
    }
    const emitProgress = (dateIndex: number) => {
      if (!options.onProgress) return
      try {
        const snapshot: ArchiveProgress = {
          date: dayjs(slices[Math.min(dateIndex, slices.length - 1)].from).format('YYYY-MM-DD'),
          completedDays: sliceIndex,
          totalDays: slices.length,
          pages,
          posts: rows.size,
          status: reason ?? 'running',
          accounts: accounts()
        }
        void Promise.resolve(options.onProgress(snapshot)).catch(() => {})
      } catch {
        /* Display failures must not interrupt journal collection. */
      }
    }
    const save = async (materializePosts = false, dateIndex = sliceIndex) => {
      if (materializePosts) {
        const path = join(out, 'posts.jsonl')
        const file = await open(`${path}.tmp`, 'w', 0o600)
        try {
          for (const row of rows.values()) await file.writeFile(`${JSON.stringify(row)}\n`)
        } finally {
          await file.close()
        }
        await rename(`${path}.tmp`, path)
      }
      await atomic(
        join(out, 'checkpoint.json'),
        JSON.stringify({ scopeFingerprint: fingerprint, pages, sliceIndex, nextCursor })
      )
      await atomic(
        join(out, 'manifest.json'),
        JSON.stringify(
          {
            ...record,
            scopeFingerprint: fingerprint,
            complete: reason === 'search_exhausted',
            reason: reason ?? 'budget',
            pages,
            posts: rows.size,
            accounts: accounts(),
            days,
            requestsThisRun: requests,
            outsideWindow,
            minTimestamp,
            maxTimestamp,
            coverage:
              'Accessible SearchTimeline scan ended under the recorded cursor policy; cursor-only confirmation is empirical. Historical completeness and date-operator timezone are not guaranteed.'
          },
          null,
          2
        )
      )
      emitProgress(dateIndex)
    }
    await save(true)
    while (!reason && requests < maxRequests && requests < maxPages) {
      emitProgress(sliceIndex)
      if (requests > 0 || pages > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
      let response: unknown
      requests++
      try {
        response = await options.search({
          ...archiveQueryWindow(slices[sliceIndex]),
          listId: scope.listId,
          cursor: nextCursor
        })
      } catch {
        reason = 'request_failed'
        break
      }
      const envelope: Envelope = {
        version: 1,
        scopeFingerprint: fingerprint,
        index: pages + 1,
        sliceIndex,
        query: queryFor(slices[sliceIndex]),
        requestCursor: nextCursor,
        response
      }
      // Journal is authoritative. A crash before derived files are replaced is repaired on resume.
      await atomic(join(out, 'pages', `${String(pages + 1).padStart(6, '0')}.json`), JSON.stringify(envelope))
      processPage(envelope)
      await save(false, lastPageSlice)
    }
    reason ??= 'budget'
    await save(true, reason === 'request_failed' ? sliceIndex : requests ? lastPageSlice : sliceIndex)
    return { complete: reason === 'search_exhausted', reason, pages, posts: rows.size }
  } finally {
    await lock.close()
    await rm(join(out, '.lock'))
  }
}
