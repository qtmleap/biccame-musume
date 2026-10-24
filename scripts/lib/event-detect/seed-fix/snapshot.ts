import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { OWNED_TABLES, pushTo } from './common'

const EventRowSchema = z.object({
  id: z.string().nonempty(),
  title: z.string().nonempty(),
  start_date: z.string().nonempty(),
  end_date: z.string().nullable(),
  ended_at: z.string().nullable(),
  limited_quantity: z.number().nullable(),
  created_at: z.string().nonempty()
})
const StoreRowSchema = z.object({ event_id: z.string().nonempty(), store_key: z.string().nonempty() })
const ReferenceRowSchema = z.object({
  id: z.string().nonempty(),
  event_id: z.string().nonempty(),
  type: z.string().nonempty(),
  url: z.string().nonempty()
})
const ConditionRowSchema = z.object({
  id: z.string().nonempty(),
  event_id: z.string().nonempty(),
  type: z.string().nonempty(),
  quantity: z.number().nullable()
})
const CountRowSchema = z.object({ event_id: z.string().nonempty(), n: z.number() })
const CategoryRowSchema = z.object({
  id: z.string().nonempty(),
  title: z.string(),
  category: z.string(),
  is_verified: z.number()
})

/** イベントの題とカテゴリ（確認済みも含む全イベント。acsta の付け替えに使う） */
export type CategoryRow = { id: string; title: string; category: string; isVerified: boolean }

export type SnapshotEvent = {
  id: string
  title: string
  startDate: string
  endDate: string | null
  endedAt: string | null
  limitedQuantity: number | null
  createdAt: string
  stores: string[]
  references: { id: string; type: string; url: string }[]
  conditions: { id: string; type: string; quantity: number | null }[]
  /** events を参照する他のテーブルの行数（0 件は含まない）。あれば削除しない */
  blockedBy: { table: string; count: number }[]
}

export type ReferencingTable = { table: string; column: string }

export type FixSnapshot = {
  /** is_verified=0 のイベント */
  events: SnapshotEvent[]
  /** 全イベント（is_verified の別なく）の題とカテゴリ */
  categories: CategoryRow[]
  /** PRAGMA foreign_keys（この接続の値。0 なら ON DELETE CASCADE は働かず、子の行は明示的に消す） */
  foreignKeys: number
  /** events を参照するテーブル（PRAGMA foreign_key_list から探す） */
  referencing: ReferencingTable[]
}

const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** events を参照するテーブルと列。ハードコードせず、スキーマ（外部キー）から探す。後から増えたテーブルも拾う */
const findReferencing = (db: Database): ReferencingTable[] =>
  db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .filter(({ name }) => TABLE_NAME.test(name))
    .flatMap(({ name }) =>
      db
        .query<{ table: string; from: string }, []>(`PRAGMA foreign_key_list("${name}")`)
        .all()
        .filter((key) => key.table === 'events' && TABLE_NAME.test(key.from))
        .map((key) => ({ table: name, column: key.from }))
    )

const parseRows = <T>(schema: z.ZodType<T>, rows: unknown, label: string) => {
  const parsed = z.array(schema).safeParse(rows)
  if (!parsed.success) throw new Error(`${label}: unexpected rows: ${parsed.error.message}`)
  return parsed.data
}

/** event_id ごとの行の一覧 */
const byEvent = <T extends { event_id: string }>(rows: readonly T[]) => {
  const index = new Map<string, T[]>()
  for (const row of rows) pushTo(index, row.event_id, row)
  return index
}

const rowsOf = <T>(index: ReadonlyMap<string, readonly T[]>, id: string): readonly T[] => {
  const rows = index.get(id)
  return rows === undefined ? [] : rows
}

const UNVERIFIED = '(SELECT id FROM events WHERE is_verified = 0)'

/** is_verified=0 のイベントと、その子の行・参照されている行数を読む（読み取りだけ） */
export const readFixSnapshot = (db: Database): FixSnapshot => {
  const events = parseRows(
    EventRowSchema,
    db
      .query(
        'SELECT id, title, start_date, end_date, ended_at, limited_quantity, created_at FROM events WHERE is_verified = 0 ORDER BY id'
      )
      .all(),
    'events'
  )
  const stores = byEvent(
    parseRows(
      StoreRowSchema,
      db.query(`SELECT event_id, store_key FROM event_stores WHERE event_id IN ${UNVERIFIED}`).all(),
      'event_stores'
    )
  )
  const references = byEvent(
    parseRows(
      ReferenceRowSchema,
      db
        .query(
          `SELECT id, event_id, type, url FROM event_reference_urls WHERE event_id IN ${UNVERIFIED} ORDER BY created_at, id`
        )
        .all(),
      'event_reference_urls'
    )
  )
  const conditions = byEvent(
    parseRows(
      ConditionRowSchema,
      db
        .query(`SELECT id, event_id, type, quantity FROM event_conditions WHERE event_id IN ${UNVERIFIED} ORDER BY id`)
        .all(),
      'event_conditions'
    )
  )
  const categories = parseRows(
    CategoryRowSchema,
    db.query('SELECT id, title, category, is_verified FROM events ORDER BY id').all(),
    'events (category)'
  )
  const referencing = findReferencing(db)
  const blockers = referencing.filter(({ table }) => !OWNED_TABLES.includes(table))
  const blocked = blockers.map(({ table, column }) => ({
    table,
    counts: new Map(
      parseRows(
        CountRowSchema,
        db
          .query(
            `SELECT ${column} AS event_id, count(*) AS n FROM ${table} WHERE ${column} IN ${UNVERIFIED} GROUP BY ${column}`
          )
          .all(),
        table
      ).map((row) => [row.event_id, row.n] as const)
    )
  }))
  const foreignKeys = db.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()
  return {
    events: events.map((row) => ({
      id: row.id,
      title: row.title,
      startDate: row.start_date,
      endDate: row.end_date,
      endedAt: row.ended_at,
      limitedQuantity: row.limited_quantity,
      createdAt: row.created_at,
      stores: rowsOf(stores, row.id).map((store) => store.store_key),
      references: rowsOf(references, row.id).map(({ id, type, url }) => ({ id, type, url })),
      conditions: rowsOf(conditions, row.id).map(({ id, type, quantity }) => ({ id, type, quantity })),
      blockedBy: blocked.flatMap(({ table, counts }) => {
        const count = counts.get(row.id)
        return count === undefined ? [] : [{ table, count }]
      })
    })),
    categories: categories.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      isVerified: row.is_verified !== 0
    })),
    foreignKeys: foreignKeys === null ? -1 : foreignKeys.foreign_keys,
    referencing
  }
}
