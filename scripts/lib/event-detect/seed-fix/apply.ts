import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { countRows, MAX_LIMITED_QUANTITY, TABLES } from '../seed'
import { changedEvents, type FixPlan } from './plan'

type Row = Record<string, unknown>

/**
 * 直すイベント以外の行（events と 3 つの子テーブルの全列）のハッシュ。確認済みの行や対応が引けなかった行が、
 * 書き込みの前後で 1 列も変わっていないことの検算に使う。
 */
const untouchedFingerprint = (db: Database, touched: ReadonlySet<string>) => {
  const rows = (table: string, column: string) =>
    db
      .query<Row, []>(`SELECT * FROM ${table} ORDER BY id`)
      .all()
      .filter((row) => !touched.has(String(row[column])))
  return createHash('sha256')
    .update(
      JSON.stringify([
        rows('events', 'id'),
        rows('event_stores', 'event_id'),
        rows('event_reference_urls', 'event_id'),
        rows('event_conditions', 'event_id')
      ])
    )
    .digest('hex')
}

export type FixWriteOptions = {
  /** updated_at に入れる時刻（ISO）。D1 には Prisma の形式（+00:00）で書く */
  now: string
}

const expectChanges = (label: string, actual: number, expected: number) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected} row(s) changed but ${actual} changed`)
}

/**
 * 計画を 1 つのトランザクションで書く（BEGIN IMMEDIATE）。どの UPDATE / DELETE も、計画を作ったときの値を WHERE に入れるか
 * 変更件数を確かめる（計画の後で行が変わっていたら止まる）。書いた後は、4 つのテーブルの件数と、直さない行のハッシュを検算する。
 * 合わなければ例外を投げてロールバックする。イベントの削除は、子の行を明示的に消してから events を消す。
 * acsta の付け替え（確認済みの行も含む）は category と updated_at だけを変え、行数は変わらない。
 */
export const applyFix = (db: Database, plan: FixPlan, options: FixWriteOptions) => {
  const targets = changedEvents(plan)
  const deletes = new Set(targets.filter((event) => event.outcome === 'delete').map((event) => event.eventId))
  const touched = new Set([...targets.map((event) => event.eventId), ...plan.recategorize.map((row) => row.id)])
  const write = db.transaction(() => {
    const before = countRows(db)
    const fingerprint = untouchedFingerprint(db, touched)
    // ended_at / updated_at は Prisma の DateTime 列なので、アプリと同じ +00:00 の形式で書く
    const stamp = toD1DateTime(options.now)
    const setEndedAt = db.prepare(
      'UPDATE events SET ended_at = ?, updated_at = ? WHERE id = ? AND is_verified = 0 AND end_date IS NULL AND ended_at IS NULL'
    )
    const clearQuantity = db.prepare(
      'UPDATE events SET limited_quantity = NULL, updated_at = ? WHERE id = ? AND is_verified = 0 AND limited_quantity = ?'
    )
    const clearCondition = db.prepare(
      "UPDATE event_conditions SET type = 'everyone', quantity = NULL, updated_at = ? WHERE id = ? AND event_id = ? AND type = 'first_come' AND quantity > ?"
    )
    // 終了が分からないまま止まっている削除は、書く直前にも終了の情報が無いことを確かめる（計画の後で入っていたら 0 件になって止まる）
    const deleteEvent = db.prepare('DELETE FROM events WHERE id = ? AND is_verified = 0')
    const deleteEndless = db.prepare(
      'DELETE FROM events WHERE id = ? AND is_verified = 0 AND end_date IS NULL AND ended_at IS NULL'
    )
    const setAcsta = db.prepare(
      "UPDATE events SET category = 'acsta', updated_at = ? WHERE id = ? AND title = ? AND category = 'other'"
    )
    const expected = { ...before }
    for (const event of targets) {
      const unverified = db
        .query<{ is_verified: number }, [string]>('SELECT is_verified FROM events WHERE id = ?')
        .get(event.eventId)
      if (unverified === null || unverified.is_verified !== 0)
        throw new Error(`${event.eventId}: not an unverified event`)
      if (event.outcome === 'delete') {
        // 他のテーブルが参照していないことを書く直前にもう一度確かめる
        for (const { table, column } of plan.blockers) {
          const row = db
            .query<{ n: number }, [string]>(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`)
            .get(event.eventId)
          if (row === null || row.n !== 0) throw new Error(`${event.eventId}: referenced by ${table}`)
        }
        expectChanges(
          `event_stores of ${event.eventId}`,
          db.prepare('DELETE FROM event_stores WHERE event_id = ?').run(event.eventId).changes,
          event.children.event_stores
        )
        expectChanges(
          `event_reference_urls of ${event.eventId}`,
          db.prepare('DELETE FROM event_reference_urls WHERE event_id = ?').run(event.eventId).changes,
          event.children.event_reference_urls
        )
        expectChanges(
          `event_conditions of ${event.eventId}`,
          db.prepare('DELETE FROM event_conditions WHERE event_id = ?').run(event.eventId).changes,
          event.children.event_conditions
        )
        expectChanges(
          `events ${event.eventId}`,
          (event.endUnknown ? deleteEndless : deleteEvent).run(event.eventId).changes,
          1
        )
        expected.events -= 1
        expected.event_stores -= event.children.event_stores
        expected.event_reference_urls -= event.children.event_reference_urls
        expected.event_conditions -= event.children.event_conditions
        continue
      }
      if (event.endedAt !== null)
        expectChanges(
          `ended_at ${event.eventId}`,
          setEndedAt.run(toD1DateTime(event.endedAt.iso), stamp, event.eventId).changes,
          1
        )
      if (event.quantity !== null) {
        expectChanges(
          `limited_quantity ${event.eventId}`,
          clearQuantity.run(stamp, event.eventId, event.quantity.from).changes,
          1
        )
        for (const conditionId of event.quantity.conditionIds)
          expectChanges(
            `condition ${conditionId}`,
            clearCondition.run(stamp, conditionId, event.eventId, MAX_LIMITED_QUANTITY).changes,
            1
          )
      }
    }
    // acsta の付け替え。確認済みの行も対象（削除するイベントは計画から除かれている）。題と category が計画のときのままの行だけを書く
    for (const row of plan.recategorize) {
      if (deletes.has(row.id)) throw new Error(`${row.id}: both deleted and recategorized`)
      expectChanges(`category ${row.id}`, setAcsta.run(stamp, row.id, row.title).changes, 1)
    }
    const after = countRows(db)
    for (const table of TABLES)
      if (after[table] !== expected[table])
        throw new Error(`${table}: expected ${expected[table]} rows after fix but found ${after[table]}`)
    if (untouchedFingerprint(db, touched) !== fingerprint) throw new Error('rows outside the fix changed; rolled back')
    return { before, after }
  })
  // 書く側の待ち合わせは IMMEDIATE で先に書き込みロックを取る（途中で他の接続に割り込まれて失敗しない）
  return write.immediate()
}
