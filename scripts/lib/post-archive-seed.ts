import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { dayjs } from '../../workers/bot/src/timeline/utils/dayjs'
import { ArchiveFailure, type ArchiveScope, parseArchivePage } from './post-archive'

export type SeedDescriptor = { version: 1; pages: number; files: { name: string; sha256: string }[] }
export const isPathWithin = (parent: string, child: string) => {
  const difference = relative(parent, child)
  return difference !== '..' && !difference.startsWith(`..${sep}`) && !isAbsolute(difference)
}
const canonicalTarget = async (path: string): Promise<string> => {
  const absolute = resolve(path)
  try {
    return await realpath(absolute)
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
    return resolve(await canonicalTarget(dirname(absolute)), basename(absolute))
  }
}
export const assertSeedPathsDisjoint = async (source: string, out: string) => {
  const pairs = [
    [resolve(source), resolve(out)],
    [await canonicalTarget(source), await canonicalTarget(out)]
  ]
  for (const [left, right] of pairs)
    if (isPathWithin(left, right) || isPathWithin(right, left)) throw new ArchiveFailure('invalid_params')
}
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const read = async (path: string) =>
  readFile(path).catch(() => {
    throw new ArchiveFailure('missing_journal')
  })
const parse = (value: Buffer | string) => {
  try {
    return JSON.parse(value.toString())
  } catch {
    throw new ArchiveFailure('corrupt_journal')
  }
}
const regular = async (path: string, directory = false) => {
  const stat = await lstat(path).catch(() => {
    throw new ArchiveFailure('missing_journal')
  })
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))
    throw new ArchiveFailure('corrupt_journal')
}
const unlocked = async (path: string) => {
  const stat = await lstat(join(path, '.lock')).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return undefined
  })
  if (stat) throw new ArchiveFailure('locked')
}
const names = async (path: string) =>
  (await readdir(join(path, 'pages'))).filter((name) => name !== '.DS_Store' && !name.endsWith('.tmp')).sort()
const query = (scope: ArchiveScope) => {
  const window = {
    since: dayjs(scope.from).startOf('day').subtract(1, 'day'),
    until: dayjs(scope.until).subtract(1, 'millisecond').startOf('day').add(1, 'day')
  }
  return `list:${scope.listId} since:${window.since.format('YYYY-MM-DD')} until:${window.until.add(1, 'day').format('YYYY-MM-DD')}`
}
const legacyRecord = (scope: ArchiveScope) => ({
  schema: 2,
  queryVersion: 1,
  queryMode: 'jst_calendar_days',
  product: 'Latest',
  count: 20,
  exhaustionPolicy: { version: 1, consecutiveReplacementPairs: 3 },
  ...scope,
  query: query(scope)
})
export const readLegacySeedScope = async (path: string): Promise<ArchiveScope> => {
  await regular(path, true)
  await regular(join(path, 'scope.json'))
  const bytes = await read(join(path, 'scope.json'))
  const stored = parse(bytes)
  if (
    !stored ||
    typeof stored !== 'object' ||
    stored.schema !== 2 ||
    !/^\d+$/.test(stored.listId) ||
    typeof stored.from !== 'string' ||
    typeof stored.until !== 'string' ||
    stored.from >= stored.until ||
    dayjs(stored.from).toISOString() !== stored.from ||
    dayjs(stored.until).toISOString() !== stored.until
  )
    throw new ArchiveFailure('corrupt_journal')
  const scope = { listId: stored.listId, from: stored.from, until: stored.until }
  if (bytes.toString() !== JSON.stringify(legacyRecord(scope))) throw new ArchiveFailure('scope_mismatch')
  return scope
}
const validateLegacy = async (path: string, scope: ArchiveScope): Promise<SeedDescriptor> => {
  await regular(path, true)
  await regular(join(path, 'pages'), true)
  await unlocked(path)
  const inherited = await readLegacySeedScope(path)
  if (JSON.stringify(inherited) !== JSON.stringify(scope)) throw new ArchiveFailure('scope_mismatch')
  const scopeBytes = await read(join(path, 'scope.json'))
  const fingerprint = digest(scopeBytes)
  const pages = await names(path)
  const checkpointBytes = await readFile(join(path, 'checkpoint.json')).catch(() => undefined)
  if (checkpointBytes && parse(checkpointBytes).pages > pages.length) throw new ArchiveFailure('missing_journal')
  const files = [{ name: 'scope.json', sha256: fingerprint }]
  let sliceIndex = 0
  let from = scope.from
  let cursor: string | undefined
  let empty = 0
  let dayPages = 0
  const cursors = new Set<string>()
  const ids = new Set<string>()
  for (const [index, name] of pages.entries()) {
    if (name !== `${String(index + 1).padStart(6, '0')}.json` || from >= scope.until)
      throw new ArchiveFailure('corrupt_journal')
    await regular(join(path, 'pages', name))
    const bytes = await read(join(path, 'pages', name))
    const envelope = parse(bytes)
    const end = dayjs(from).startOf('day').add(1, 'day').toISOString()
    const slice = { ...scope, from, until: end < scope.until ? end : scope.until }
    if (
      envelope?.version !== 1 ||
      envelope.scopeFingerprint !== fingerprint ||
      envelope.index !== index + 1 ||
      envelope.sliceIndex !== sliceIndex ||
      envelope.query !== query(slice) ||
      envelope.requestCursor !== cursor
    )
      throw new ArchiveFailure('corrupt_journal')
    let parsed: ReturnType<typeof parseArchivePage>
    try {
      parsed = parseArchivePage(envelope.response)
    } catch {
      throw new ArchiveFailure('corrupt_journal')
    }
    let added = 0
    dayPages++
    for (const post of parsed.posts)
      if (!ids.has(post.id)) {
        ids.add(post.id)
        added++
      }
    empty = envelope.requestCursor && parsed.replacementPair ? empty + 1 : 0
    const safetyStop = Boolean(
      parsed.nextCursor && (cursors.has(parsed.nextCursor) || (dayPages > 1 && parsed.posts.length > 0 && added === 0))
    )
    if (safetyStop && index !== pages.length - 1) throw new ArchiveFailure('corrupt_journal')
    if (!safetyStop && (!parsed.nextCursor || empty >= 3)) {
      from = slice.until
      sliceIndex++
      cursor = undefined
      empty = 0
      dayPages = 0
      cursors.clear()
      ids.clear()
    } else if (parsed.nextCursor) {
      cursor = parsed.nextCursor
      cursors.add(cursor)
    }
    files.push({ name: `pages/${name}`, sha256: digest(bytes) })
  }
  await unlocked(path)
  return { version: 1, pages: pages.length, files }
}
export const verifySeedSnapshot = async (path: string, descriptor: SeedDescriptor, scope: ArchiveScope) => {
  await regular(path, true)
  await regular(join(path, 'complete.json'))
  const marker = parse(await read(join(path, 'complete.json')))
  if (JSON.stringify(marker) !== JSON.stringify(descriptor)) throw new ArchiveFailure('corrupt_journal')
  for (const file of descriptor.files) {
    if (!/^(scope\.json|pages\/\d{6}\.json)$/.test(file.name)) throw new ArchiveFailure('corrupt_journal')
    await regular(join(path, file.name))
    if (digest(await read(join(path, file.name))) !== file.sha256) throw new ArchiveFailure('corrupt_journal')
  }
  const checked = await validateLegacy(path, scope)
  if (JSON.stringify(checked) !== JSON.stringify(descriptor)) throw new ArchiveFailure('corrupt_journal')
}
export const prepareSeedSnapshot = async (source: string, out: string, scope: ArchiveScope) => {
  await assertSeedPathsDisjoint(source, out)
  await regular(source, true)
  await regular(out, true)
  const descriptor = await validateLegacy(source, scope)
  const stage = join(out, `.seed-staging-${randomUUID()}`)
  await mkdir(join(stage, 'pages'), { recursive: true, mode: 0o700 })
  try {
    for (const file of descriptor.files) await copyFile(join(source, file.name), join(stage, file.name))
    await writeFile(join(stage, 'complete.json'), JSON.stringify(descriptor), { mode: 0o600 })
    await verifySeedSnapshot(stage, descriptor, scope)
    if (JSON.stringify(await validateLegacy(source, scope)) !== JSON.stringify(descriptor))
      throw new ArchiveFailure('corrupt_journal')
    await rename(stage, join(out, 'seed'))
    return descriptor
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}
