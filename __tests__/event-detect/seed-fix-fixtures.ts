import type { Database } from 'bun:sqlite'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { jstDayToUtcIso } from '../../scripts/lib/event-detect/seed'
import { type FixRunOptions, runFix } from '../../scripts/lib/event-detect/seed-fix'
import { makeLocalDb } from '../fixtures/local-d1'
import {
  type EventSpec,
  emulatedEvents,
  kinds,
  NON_BICCAME,
  NOW,
  reportFor,
  SEEDED_AT,
  specs,
  url
} from './seed-fix-scenarios'

/** JST の暦日 → その日の JST 0 時の UTC の ISO（seed が書く start_date と同じ形） */
const jstMidnight = (day: string) => {
  const iso = jstDayToUtcIso(day)
  if (iso === undefined) throw new Error(`not a calendar day: ${day}`)
  return iso
}

const insertEvent = (db: Database, spec: EventSpec) => {
  const stamp = spec.createdAt === undefined ? SEEDED_AT : spec.createdAt
  const startDay = spec.startDay === undefined ? '2026-07-01' : spec.startDay
  db.run(
    `INSERT INTO events (id, category, title, limited_quantity, start_date, end_date, ended_at, is_verified, is_preliminary, created_at, updated_at)
     VALUES (?, 'limited_card', ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      spec.id,
      spec.title,
      spec.limitedQuantity === undefined ? null : spec.limitedQuantity,
      jstMidnight(startDay),
      spec.endDate === undefined ? null : spec.endDate,
      spec.endedAt === undefined ? null : spec.endedAt,
      spec.verified ? 1 : 0,
      stamp,
      stamp
    ]
  )
  db.run('INSERT INTO event_stores (id, event_id, store_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    `${spec.id}-store`,
    spec.id,
    spec.store === undefined ? 'kashiwa' : spec.store,
    stamp,
    stamp
  ])
  for (const ref of spec.refs)
    db.run(
      'INSERT INTO event_reference_urls (id, event_id, type, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [`${spec.id}-${ref.type}`, spec.id, ref.type, url(ref.id), stamp, stamp]
    )
  const quantity = spec.conditionQuantity === undefined ? spec.limitedQuantity : spec.conditionQuantity
  db.run(
    'INSERT INTO event_conditions (id, event_id, type, purchase_amount, quantity, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)',
    [
      `${spec.id}-cond`,
      spec.id,
      quantity === undefined || quantity === null ? 'everyone' : 'first_come',
      quantity === undefined ? null : quantity,
      stamp,
      stamp
    ]
  )
}

const makeMaterials = async (root: string, db: Database) => {
  const dir = join(root, '.cache', 'event-detect')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'emulated-v2.json'), JSON.stringify(emulatedEvents))
  await writeFile(
    join(dir, 'posts.jsonl'),
    `${Object.entries(kinds)
      .map(([id, kind]) =>
        JSON.stringify({ id, screenName: 'bic_kashiwa', kind, createdAt: '2026-07-01T00:00:00.000Z' })
      )
      .join('\n')}\n`
  )
  const reportPath = join(dir, 'seed-report-applied.json')
  await writeFile(reportPath, JSON.stringify(reportFor(SEEDED_AT)))
  // characters.json: is_biccame_musume が false の店舗はイベントごと削除する
  await writeFile(
    join(root, 'characters.json'),
    JSON.stringify([
      { id: 'kashiwa', character: { name: '柏たん', is_biccame_musume: true } },
      ...NON_BICCAME.map((id) => ({ id, character: { name: id, is_biccame_musume: false } }))
    ])
  )
  for (const spec of specs) insertEvent(db, spec)
  // 参照があるイベントを削除しない検査のために、イベントを参照する user_events を足す
  db.run(`INSERT INTO users (id, created_at, updated_at) VALUES ('u-1', ?, ?)`, [SEEDED_AT, SEEDED_AT])
  db.run(
    `INSERT INTO user_events (id, user_id, event_id, status, created_at, updated_at) VALUES ('ue-1', 'u-1', 'e-referenced', 'obtained', ?, ?)`,
    [SEEDED_AT, SEEDED_AT]
  )
  db.run(
    `INSERT INTO user_events (id, user_id, event_id, status, created_at, updated_at) VALUES ('ue-3', 'u-1', 'e-store-referenced', 'obtained', ?, ?)`,
    [SEEDED_AT, SEEDED_AT]
  )
  return { dir, reportPath }
}

export const fixOptions = (
  root: string,
  dir: string,
  dbPath: string,
  extra: Partial<FixRunOptions> = {}
): FixRunOptions => ({
  dir,
  cacheRoot: join(root, '.cache'),
  dbPath,
  charactersPath: join(root, 'characters.json'),
  apply: false,
  reports: [join(dir, 'seed-report-applied.json')],
  reportPath: join(dir, 'seed-fix-report.json'),
  now: NOW,
  ...extra
})

export const dump = (db: Database) => ({
  events: db.query('SELECT * FROM events ORDER BY id').all(),
  event_stores: db.query('SELECT * FROM event_stores ORDER BY id').all(),
  event_reference_urls: db.query('SELECT * FROM event_reference_urls ORDER BY id').all(),
  event_conditions: db.query('SELECT * FROM event_conditions ORDER BY id').all(),
  user_events: db.query('SELECT * FROM user_events ORDER BY id').all()
})

export const refsOf = (db: Database, eventId: string) =>
  db
    .query<{ type: string; url: string }, [string]>(
      'SELECT type, url FROM event_reference_urls WHERE event_id = ? ORDER BY type'
    )
    .all(eventId)

/** 各テストファイルが所有する一時ディレクトリだけを片付ける。 */
export const createSeedFixFixture = () => {
  const directories: string[] = []
  const cleanup = async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
  }
  const tempDir = async () => {
    const path = await mkdtemp(join(tmpdir(), 'event-detect-seed-fix-'))
    directories.push(path)
    return path
  }
  const setup = async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    const materials = await makeMaterials(root, db)
    return { root, db, path, ...materials }
  }
  const planOf = async (root: string, dir: string, dbPath: string) => {
    const run = await runFix(fixOptions(root, dir, dbPath))
    return run.plan
  }
  return { cleanup, setup, planOf }
}
