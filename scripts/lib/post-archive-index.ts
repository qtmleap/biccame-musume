// Derived List projection. Raw pages remain authoritative; each page is one SQLite transaction.
import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { lstat, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArchiveAccount, RowIndex } from './post-archive'

const schema = 1
export type ReplayState = {
  pages: number
  nextCursor?: string
  reason?: 'unsupported_payload' | 'repeated_cursor' | 'list_exhausted'
  terminalReason?: string
  minTimestamp?: string
  maxTimestamp?: string
  queryOldestTimestamp?: string
  topLevelOldestTimestamp?: string
  outsideWindow: number
}
type Stamp = { size: number; mtimeMs: number; ino: number; dev: number }
type PageRecord = { name: string; stamp: string; sha256: string }
const digest = (body: string | Buffer) => createHash('sha256').update(body).digest('hex')
const stamp = async (path: string): Promise<Stamp> => {
  const value = await lstat(path)
  if (!value.isFile()) throw new Error('Non-regular journal file')
  // HF snapshots add hardlinks, changing ctime without changing journal contents.
  return { size: value.size, mtimeMs: value.mtimeMs, ino: value.ino, dev: value.dev }
}
const missing = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'

export async function archiveIndexKey(context: unknown, sourceUrl: string) {
  // Read the actual executing modules: fixes to normalization invalidate cached JSON automatically.
  const urls = new Set([sourceUrl, import.meta.url])
  if (new URL(sourceUrl).pathname.endsWith('.ts')) {
    urls.add(new URL('../../workers/bot/src/timeline/utils/dayjs.ts', sourceUrl).href)
    urls.add(new URL('../../workers/bot/src/timeline/endpoint.ts', sourceUrl).href)
  }
  const hash = createHash('sha256').update(JSON.stringify({ schema, context, bun: process.versions.bun }))
  for (const url of urls) hash.update(await readFile(new URL(url)))
  return hash.digest('hex')
}

export class ListArchiveIndex {
  private count = 0
  private pageChanged = false
  private db: Database
  private metadata: { key: string; state: ReplayState; count: number; generation: number; output?: { generation: number; stamp: string } }
  private constructor(readonly out: string, private key: string, db: Database) {
    this.db = db
    const stored = db.query('SELECT json FROM metadata WHERE id = 1').get() as { json: string } | null
    this.metadata = stored ? JSON.parse(stored.json) : { key, state: { pages: 0, outsideWindow: 0 }, count: 0, generation: 0 }
    if (!this.metadata || this.metadata.key !== key || !Number.isSafeInteger(this.metadata.state?.pages) ||
      this.metadata.state.pages < 0 ||
      (this.metadata.state.reason !== undefined && !['unsupported_payload', 'repeated_cursor', 'list_exhausted'].includes(this.metadata.state.reason)) ||
      !Number.isSafeInteger(this.metadata.count) || this.metadata.count < 0 ||
      !Number.isSafeInteger(this.metadata.generation) || this.metadata.generation < 0 ||
      !Number.isSafeInteger(this.metadata.state.outsideWindow) || this.metadata.state.outsideWindow < 0) this.reset()
    const rows = db.query('SELECT count(*) AS n FROM rows').get() as { n: number }
    const posts = db.query('SELECT count(*) AS n FROM posts').get() as { n: number }
    if (rows.n !== this.metadata.count || posts.n !== rows.n) this.reset()
    this.count = this.metadata.count
  }
  static async open(out: string, key: string) {
    const { Database } = await import('bun:sqlite')
    const path = join(out, 'resume.sqlite')
    const connect = () => {
      const db = new Database(path, { create: true, strict: true })
      try {
        db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
          CREATE TABLE IF NOT EXISTS metadata(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS rows(id TEXT PRIMARY KEY, json TEXT NOT NULL, location TEXT NOT NULL, position INTEGER NOT NULL);
          CREATE INDEX IF NOT EXISTS rows_order ON rows(location, position);
          CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, json TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS accounts(key TEXT PRIMARY KEY, json TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS cursors(value TEXT PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS pages(number INTEGER PRIMARY KEY, name TEXT NOT NULL, stamp TEXT NOT NULL, sha256 TEXT NOT NULL);`)
        return new ListArchiveIndex(out, key, db)
      } catch (error) { db.close(); throw error }
    }
    try { return connect() } catch {
      // Only the disposable projection is removed. Never touch authoritative raw pages.
      await rm(path, { force: true })
      return connect()
    }
  }
  private reset() {
    this.db.transaction(() => {
      this.db.exec('DELETE FROM rows; DELETE FROM posts; DELETE FROM accounts; DELETE FROM cursors; DELETE FROM pages; DELETE FROM metadata;')
      this.metadata = { key: this.key, state: { pages: 0, outsideWindow: 0 }, count: 0, generation: 0 }
      this.count = 0
      this.persist()
    })()
  }
  private persist() {
    this.db.query('INSERT OR REPLACE INTO metadata(id,json) VALUES(1,?)').run(JSON.stringify(this.metadata))
  }
  readonly rows = (() => {
    const owner = this
    return {
    get: (id: string): RowIndex | undefined => {
      const row = this.db.query('SELECT json FROM rows WHERE id=?').get(id) as { json: string } | null
      return row ? JSON.parse(row.json) : undefined
    },
    set: (id: string, row: RowIndex) => {
      if (!this.rows.get(id)) this.count++
      this.db.query('INSERT INTO rows(id,json,location,position) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,location=excluded.location,position=excluded.position')
        .run(id, JSON.stringify(row), row.location, row.position)
    },
    get size() { return owner.count }
    }
  })()
  get size() { return this.count }
  setPost(id: string, json: string) {
    this.db.query('INSERT INTO posts(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(id, json)
    this.pageChanged = true
  }
  hasCursor(value: string) { return !!this.db.query('SELECT 1 FROM cursors WHERE value=?').get(value) }
  addCursor(value: string) { this.db.query('INSERT OR IGNORE INTO cursors(value) VALUES(?)').run(value) }
  accounts(): ArchiveAccount[] {
    return (this.db.query('SELECT json FROM accounts').all() as { json: string }[]).map(value => JSON.parse(value.json))
  }
  get state() { return { ...this.metadata.state } }
  async validate(names: string[]): Promise<void> {
    if (this.metadata.state.pages > names.length) throw new Error('Missing indexed page')
    const stamps: string[] = new Array(names.length)
    // Bound concurrency even for multi-year journals.
    let next = 0
    await Promise.all(Array.from({ length: Math.min(32, names.length) }, async () => {
      for (;;) {
        const index = next++
        if (index >= names.length) break
        stamps[index] = JSON.stringify(await stamp(join(this.out, 'pages', names[index])))
      }
    }))
    const saved = this.db.query('SELECT number,name,stamp,sha256 FROM pages ORDER BY number').all() as (PageRecord & { number: number })[]
    if (saved.length !== this.metadata.state.pages) { this.reset(); return }
    for (const [index, row] of saved.entries()) {
      if (row.number !== index + 1 || row.name !== names[index]) { this.reset(); return }
      if (row.stamp === stamps[index]) continue
      const body = await readFile(join(this.out, 'pages', names[index]))
      if (digest(body) !== row.sha256) { this.reset(); return }
      this.db.query('UPDATE pages SET stamp=? WHERE number=?').run(stamps[index], index + 1)
    }
  }
  async apply(name: string, body: string, process: () => unknown, state: () => ReplayState, accounts: () => ArchiveAccount[]) {
    const fileStamp = JSON.stringify(await stamp(join(this.out, 'pages', name)))
    this.pageChanged = false
    return this.db.transaction(() => {
      const result = process()
      const current = state()
      this.db.query('INSERT INTO pages(number,name,stamp,sha256) VALUES(?,?,?,?)').run(current.pages, name, fileStamp, digest(body))
      this.db.exec('DELETE FROM accounts')
      const insert = this.db.query('INSERT INTO accounts(key,json) VALUES(?,?)')
      for (const account of accounts()) insert.run(account.key, JSON.stringify(account))
      this.metadata = { ...this.metadata, state: current, count: this.count, generation: this.metadata.generation + (this.pageChanged ? 1 : 0) }
      this.persist()
      return result
    })()
  }
  async materialize() {
    const path = join(this.out, 'posts.jsonl')
    let existing: string | undefined
    try { existing = JSON.stringify(await stamp(path)) } catch (error) { if (!missing(error)) throw error }
    if (this.metadata.output?.generation === this.metadata.generation && this.metadata.output.stamp === existing) return
    const file = await open(`${path}.tmp`, 'w', 0o600)
    let emitted = 0
    let chunk = ''
    try {
      for (const row of this.db.query('SELECT posts.json FROM rows JOIN posts USING(id) ORDER BY rows.location,rows.position').iterate() as Iterable<{ json: string }>) {
        chunk += row.json + '\n'; emitted++
        if (chunk.length >= 1024 * 1024) { await file.writeFile(chunk); chunk = '' }
      }
      if (chunk) await file.writeFile(chunk)
      // Compare against the scalar maintained during page application, not the export query.
      if (emitted !== this.count) throw new Error('Projection row count mismatch')
    } finally { await file.close() }
    await rename(`${path}.tmp`, path)
    this.metadata.output = { generation: this.metadata.generation, stamp: JSON.stringify(await stamp(path)) }
    this.persist()
  }
  close() { this.db.close() }
}
