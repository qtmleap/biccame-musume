import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import {
  buildBackfillStatements,
  EventStoreRowSchema,
  groupEventRows,
  planEventCharacterBackfill,
  READ_EVENTS_SQL
} from '../scripts/lib/backfill-event-characters'

// 生成した SQL を、実マイグレーションを適用した使い捨てのインメモリ D1 に流して、バックフィルの挙動を固定する。
// wrangler d1 execute --local --file と同じく、文ごとに分けて db.batch で流す。.wrangler/state には触れない。

const root = resolve(import.meta.dirname, '..')
const FIXED_UPDATED_AT = '2026-01-02T03:04:05.000+00:00'
const NOW = '2026-10-31T09:00:00.000+00:00'

type Db = D1Database
type CharacterRow = { event_id: string; character_id: string; created_at: string; updated_at: string }
type EventRow = { id: string; title: string; updated_at: string; character_id: string | null }

/** ローカルのインメモリ D1 に実マイグレーションを順に適用して、テスト本体へ DB を渡す。 */
const withDatabase = async (run: (db: Db) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'backfill-event-characters-test',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const bindings = await mf.getBindings<{ DB: Db }>()
    const migrations = (await readdir(resolve(root, 'prisma/migrations'), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of migrations) {
      const sql = await readFile(resolve(root, 'prisma/migrations', name, 'migration.sql'), 'utf8')
      await bindings.DB.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))
    }
    await run(bindings.DB)
  } finally {
    await mf.dispose()
  }
}

type SeedEvent = { id: string; stores: string[]; characters?: string[]; legacyCharacterId?: string }

const seed = async (db: Db, events: SeedEvent[]) => {
  const statements = events.flatMap((event) => [
    db
      .prepare(
        'INSERT INTO events (id,category,title,start_date,character_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
      )
      .bind(
        event.id,
        'limited_card',
        `title-${event.id}`,
        FIXED_UPDATED_AT,
        event.legacyCharacterId === undefined ? null : event.legacyCharacterId,
        FIXED_UPDATED_AT,
        FIXED_UPDATED_AT
      ),
    ...event.stores.map((store) =>
      db
        .prepare('INSERT INTO event_stores (id,event_id,store_key,created_at,updated_at) VALUES (?,?,?,?,?)')
        .bind(`${event.id}:${store}`, event.id, store, FIXED_UPDATED_AT, FIXED_UPDATED_AT)
    ),
    ...(event.characters === undefined ? [] : event.characters).map((character) =>
      db
        .prepare('INSERT INTO event_characters (id,event_id,character_id,created_at,updated_at) VALUES (?,?,?,?,?)')
        .bind(`${event.id}:c:${character}`, event.id, character, FIXED_UPDATED_AT, FIXED_UPDATED_AT)
    )
  ])
  await db.batch(statements)
}

const readPlan = async (db: Db) => {
  const { results } = await db.prepare(READ_EVENTS_SQL).all()
  const rows = results.flatMap((row) => {
    const parsed = EventStoreRowSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
  expect(rows).toHaveLength(results.length)
  return planEventCharacterBackfill(groupEventRows(rows))
}

/** wrangler d1 execute --local --file と同じく、1 文ずつ prepare して batch で流す。 */
const runBackfill = async (db: Db) => {
  const plan = await readPlan(db)
  const statements = buildBackfillStatements(plan.inserts, { now: NOW, newId: () => crypto.randomUUID() })
  const results = statements.length === 0 ? [] : await db.batch(statements.map((statement) => db.prepare(statement)))
  return { plan, changes: results.reduce((total, result) => total + result.meta.changes, 0) }
}

const characters = async (db: Db) =>
  (
    await db
      .prepare(
        'SELECT event_id,character_id,created_at,updated_at FROM event_characters ORDER BY event_id,character_id'
      )
      .all<CharacterRow>()
  ).results

const events = async (db: Db) =>
  (await db.prepare('SELECT id,title,updated_at,character_id FROM events ORDER BY id').all<EventRow>()).results

const pairs = (rows: CharacterRow[]) => rows.map((row) => `${row.event_id}:${row.character_id}`)

test('空のイベントに店舗の娘が入り、複数店舗のイベントは全部入る', async () => {
  await withDatabase(async (db) => {
    await seed(db, [
      { id: 'one', stores: ['akiba'] },
      { id: 'multi', stores: ['chiba', 'akiba', 'honten'] },
      { id: 'nostore', stores: [] }
    ])
    const { plan, changes } = await runBackfill(db)
    expect(plan.inserts.map((item) => item.eventId)).toEqual(['multi', 'one'])
    expect(changes).toBe(4)
    expect(pairs(await characters(db))).toEqual(['multi:akiba', 'multi:chiba', 'multi:honten', 'one:akiba'])
  })
})

test('書いた行は created_at / updated_at が指定の形式で、id は一意', async () => {
  await withDatabase(async (db) => {
    await seed(db, [{ id: 'multi', stores: ['akiba', 'chiba'] }])
    await runBackfill(db)
    const rows = await characters(db)
    expect(rows.map((row) => [row.created_at, row.updated_at])).toEqual([
      [NOW, NOW],
      [NOW, NOW]
    ])
    const ids = (await db.prepare('SELECT id FROM event_characters').all<{ id: string }>()).results
    expect(new Set(ids.map((row) => row.id)).size).toBe(2)
  })
})

test('2回目は何も増えず、変更が0件', async () => {
  await withDatabase(async (db) => {
    await seed(db, [
      { id: 'one', stores: ['akiba'] },
      { id: 'multi', stores: ['chiba', 'akiba'] }
    ])
    await runBackfill(db)
    const first = await characters(db)
    const second = await runBackfill(db)
    expect(second.plan.inserts).toEqual([])
    expect(second.changes).toBe(0)
    expect(await characters(db)).toEqual(first)
  })
})

test('古い計画をもう一度流しても、娘のあるイベントは増えない（ガード）', async () => {
  await withDatabase(async (db) => {
    await seed(db, [{ id: 'multi', stores: ['chiba', 'akiba'] }])
    const stale = (await readPlan(db)).inserts
    const statements = buildBackfillStatements(stale, { now: NOW, newId: () => crypto.randomUUID() })
    const first = await db.batch(statements.map((statement) => db.prepare(statement)))
    expect(first.reduce((total, result) => total + result.meta.changes, 0)).toBe(2)
    const again = buildBackfillStatements(stale, { now: NOW, newId: () => crypto.randomUUID() })
    const second = await db.batch(again.map((statement) => db.prepare(statement)))
    expect(second.reduce((total, result) => total + result.meta.changes, 0)).toBe(0)
    expect(pairs(await characters(db))).toEqual(['multi:akiba', 'multi:chiba'])
  })
})

test('すでに娘のあるイベントは、店舗と違う娘でも不変', async () => {
  await withDatabase(async (db) => {
    await seed(db, [
      { id: 'explicit', stores: ['akiba', 'chiba'], characters: ['honten'] },
      { id: 'special', stores: ['akiba'], characters: ['other'] },
      { id: 'empty', stores: ['chiba'] }
    ])
    const before = (await characters(db)).filter((row) => row.event_id !== 'empty')
    await runBackfill(db)
    const after = await characters(db)
    expect(after.filter((row) => row.event_id !== 'empty')).toEqual(before)
    expect(pairs(after)).toEqual(['empty:chiba', 'explicit:honten', 'special:other'])
  })
})

test('events の updated_at と character_id は変わらない', async () => {
  await withDatabase(async (db) => {
    await seed(db, [
      { id: 'one', stores: ['akiba'] },
      { id: 'multi', stores: ['chiba', 'akiba'] },
      { id: 'legacy', stores: ['honten'], legacyCharacterId: 'honten' },
      { id: 'explicit', stores: ['akiba'], characters: ['chiba'] }
    ])
    const before = await events(db)
    await runBackfill(db)
    await runBackfill(db)
    expect(await events(db)).toEqual(before)
    expect((await events(db)).every((row) => row.updated_at === FIXED_UPDATED_AT)).toBe(true)
  })
})

test('不正な店舗キーのイベントは、有効なキーだけ書き、全部不正なら何も書かない', async () => {
  await withDatabase(async (db) => {
    await seed(db, [
      { id: 'mixed', stores: ['akiba', 'not-a-store'] },
      { id: 'invalid', stores: ['not-a-store'] }
    ])
    const { plan } = await runBackfill(db)
    expect(plan.invalidStoreKeys.map((item) => `${item.eventId}:${item.storeKey}`)).toEqual([
      'invalid:not-a-store',
      'mixed:not-a-store'
    ])
    expect(pairs(await characters(db))).toEqual(['mixed:akiba'])
  })
})
