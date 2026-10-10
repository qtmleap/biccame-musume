import type { Database } from 'bun:sqlite'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { jstDayToUtcIso, type SeedEvent } from '../../scripts/lib/event-detect/seed'
import type { FixRunOptions } from '../../scripts/lib/event-detect/seed-fix'
import { makeLocalDb } from './local-d1'

// seed --fix のテスト用の一時のローカル D1 と材料（emulate の結果・seed のレポート・posts.jsonl・characters.json・gold.json）。
// 本物のローカル D1（.wrangler/state）には触れない。

/** JST の 2026-10-10 12:00。seed --fix の基準日は 2026-10-10 */
export const NOW = '2026-10-10T03:00:00.000Z'
/** seed --apply が自動作成分を INSERT した時刻（レポートの generatedAt と D1 の created_at） */
export const SEEDED_AT = '2026-10-09T13:24:28.130Z'
/** 手で作った行（レポートに無い）の作成時刻 */
const MANUAL_AT = '2026-02-04T14:43:23.980+00:00'

export const at = (iso: string) => Date.parse(iso)

export type WorldEvent = {
  /** D1 の events.id */
  id: string
  title: string
  /** JST の暦日。start_date は JST 0 時にする */
  startDay: string
  /** events.category (default: limited_card) */
  category?: string
  /** 店舗キー (default: kashiwa) */
  store?: string
  verified?: boolean
  /** seed が作った行（レポートと emulate のイベントがある）か。既定は確認済みでなければ true。false は手で作った行 */
  auto?: boolean
  /** events.end_date / ended_at（ISO）。省略は null */
  endDate?: string
  endedAt?: string
  /** emulate の最後の言及 (default: 2026-08-01) */
  lastSeen?: string
  /** user_events から参照させる（削除できない） */
  referenced?: boolean
}

/** 時刻つきの暦日（JST 0 時）。存在しない日なら止まる */
const midnight = (day: string) => {
  const iso = jstDayToUtcIso(day)
  if (iso === undefined) throw new Error(`not a calendar day: ${day}`)
  return iso
}

const isAuto = (event: WorldEvent) => (event.auto === undefined ? event.verified !== true : event.auto)
const storeOf = (event: WorldEvent) => (event.store === undefined ? 'kashiwa' : event.store)
const categoryOf = (event: WorldEvent) => (event.category === undefined ? 'limited_card' : event.category)

export type GoldRow = { uuid: string; title: string; category: string }

const insertEvent = (db: Database, event: WorldEvent, postId: string) => {
  const stamp = isAuto(event) ? SEEDED_AT : MANUAL_AT
  db.run(
    `INSERT INTO events (id, category, title, limited_quantity, start_date, end_date, ended_at, is_verified, is_preliminary, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0, ?, ?)`,
    [
      event.id,
      categoryOf(event),
      event.title,
      midnight(event.startDay),
      event.endDate === undefined ? null : event.endDate,
      event.endedAt === undefined ? null : event.endedAt,
      event.verified ? 1 : 0,
      stamp,
      stamp
    ]
  )
  db.run('INSERT INTO event_stores (id, event_id, store_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    `${event.id}-store`,
    event.id,
    storeOf(event),
    stamp,
    stamp
  ])
  db.run(
    'INSERT INTO event_reference_urls (id, event_id, type, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [`${event.id}-announce`, event.id, 'announce', `https://x.com/bic_kashiwa/status/${postId}`, stamp, stamp]
  )
  db.run(
    'INSERT INTO event_conditions (id, event_id, type, purchase_amount, quantity, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)',
    [`${event.id}-cond`, event.id, 'everyone', stamp, stamp]
  )
}

/** events と 3 つの子テーブルと user_events の全列。書き込みの前後で行が変わっていないことの比較に使う */
export const dump = (db: Database) => ({
  events: db.query('SELECT * FROM events ORDER BY id').all(),
  event_stores: db.query('SELECT * FROM event_stores ORDER BY id').all(),
  event_reference_urls: db.query('SELECT * FROM event_reference_urls ORDER BY id').all(),
  event_conditions: db.query('SELECT * FROM event_conditions ORDER BY id').all(),
  user_events: db.query('SELECT * FROM user_events ORDER BY id').all()
})

/** 1 行だけ（events とその子の行）。確認済みの行が 1 列も変わっていないことの比較に使う */
export const rowsOf = (db: Database, id: string) => ({
  events: db.query('SELECT * FROM events WHERE id = ?').all(id),
  event_stores: db.query('SELECT * FROM event_stores WHERE event_id = ?').all(id),
  event_reference_urls: db.query('SELECT * FROM event_reference_urls WHERE event_id = ?').all(id),
  event_conditions: db.query('SELECT * FROM event_conditions WHERE event_id = ?').all(id)
})

export const categoryOfRow = (db: Database, id: string) =>
  db
    .query<{ category: string; updated_at: string }, [string]>('SELECT category, updated_at FROM events WHERE id = ?')
    .get(id)

/** 一時のルートを作る。後始末は呼び出し側の afterEach で rm する */
export const tempRoot = async (directories: string[]) => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-fix-world-'))
  directories.push(path)
  return path
}

export const removeAll = (directories: string[]) =>
  Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))

/**
 * 一時のローカル D1 に events を入れ、seed --fix の材料を .cache/event-detect に書く。
 * 非ビッカメ娘の店舗は biccamera だけ（characters.json）。投稿 ID は 1000 から連番で、種類はすべて original。
 */
export const makeWorld = async (root: string, events: readonly WorldEvent[], gold?: readonly GoldRow[]) => {
  const { db, path } = await makeLocalDb(root)
  const dir = join(root, '.cache', 'event-detect')
  await mkdir(dir, { recursive: true })
  const posts = events.map((event, index) => ({ event, postId: String(1000 + index) }))
  for (const { event, postId } of posts) insertEvent(db, event, postId)
  const autos = posts.filter(({ event }) => isAuto(event))
  const emulated = autos.map(({ event, postId }): SeedEvent & { status: string; startUnknown: boolean } => ({
    id: `emu-${event.id}`,
    store: storeOf(event),
    item: event.title,
    category: 'limited_card',
    status: 'end',
    startDate: event.startDay,
    startUnknown: false,
    firstSeen: at('2026-06-01T00:00:00.000Z'),
    lastSeen: at(event.lastSeen === undefined ? '2026-08-01T00:00:00.000Z' : event.lastSeen),
    posts: [{ postId, status: 'announce' }]
  }))
  await writeFile(join(dir, 'emulated-v1.json'), JSON.stringify(emulated))
  await writeFile(
    join(dir, 'posts.jsonl'),
    `${posts
      .map(({ postId }) =>
        JSON.stringify({
          id: postId,
          screenName: 'bic_kashiwa',
          kind: 'original',
          createdAt: '2026-07-01T00:00:00.000Z'
        })
      )
      .join('\n')}\n`
  )
  await writeFile(
    join(dir, 'seed-report-applied.json'),
    JSON.stringify({
      generatedAt: SEEDED_AT,
      events: autos.map(({ event }) => ({
        emulatedId: `emu-${event.id}`,
        store: storeOf(event),
        startDate: event.startDay,
        title: event.title
      }))
    })
  )
  await writeFile(
    join(root, 'characters.json'),
    JSON.stringify([
      { id: 'kashiwa', character: { name: '柏たん', is_biccame_musume: true } },
      { id: 'biccamera', character: { name: 'ビックカメラ', is_biccame_musume: false } }
    ])
  )
  if (gold !== undefined)
    await writeFile(
      join(dir, 'gold.json'),
      JSON.stringify({
        fetchedAt: '2026-10-08T13:16:29.706Z',
        source: 'https://biccame-musume.com',
        events: gold.map((row) => ({
          uuid: row.uuid,
          title: row.title,
          category: row.category,
          stores: ['kashiwa'],
          startDate: '2026-07-01T00:00:00.000Z',
          conditions: [],
          isPreliminary: false,
          referenceUrls: []
        }))
      })
    )
  // 参照があるイベントは削除しない検査のために、イベントを参照する user_events を足す
  const referenced = events.filter((event) => event.referenced)
  if (referenced.length > 0)
    db.run(`INSERT INTO users (id, created_at, updated_at) VALUES ('u-1', ?, ?)`, [SEEDED_AT, SEEDED_AT])
  for (const event of referenced)
    db.run(
      `INSERT INTO user_events (id, user_id, event_id, status, created_at, updated_at) VALUES (?, 'u-1', ?, 'obtained', ?, ?)`,
      [`ue-${event.id}`, event.id, SEEDED_AT, SEEDED_AT]
    )
  const options = (extra: Partial<FixRunOptions> = {}): FixRunOptions => ({
    dir,
    cacheRoot: join(root, '.cache'),
    dbPath: path,
    charactersPath: join(root, 'characters.json'),
    apply: false,
    reports: [join(dir, 'seed-report-applied.json')],
    reportPath: join(dir, 'seed-fix-report.json'),
    now: NOW,
    ...extra
  })
  return { db, path, dir, emulated, options }
}
