import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const MIGRATIONS = resolve(import.meta.dir, '../../prisma/migrations')

/** 本番と同じ DDL（prisma/migrations の SQL を順に流す）で、.wrangler/state 配下に一時のローカル D1 を作る */
export const makeLocalDb = async (root: string, name = 'local.sqlite') => {
  const path = join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', name)
  await mkdir(dirname(path), { recursive: true })
  const db = new Database(path, { create: true })
  db.exec('PRAGMA journal_mode = WAL')
  const migrations = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const migration of migrations) db.exec(readFileSync(join(MIGRATIONS, migration, 'migration.sql'), 'utf8'))
  return { db, path }
}
