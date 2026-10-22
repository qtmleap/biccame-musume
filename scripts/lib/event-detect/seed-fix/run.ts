import { Database } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  assertColumns,
  assertInside,
  backupDatabase,
  checkColumns,
  compactStamp,
  countRows,
  jstDayOf,
  openLocalDb,
  readSeedEvents,
  readStoreMarks,
  sharedPostScan,
  TABLES
} from '../seed'
import { parseStatusUrl } from '../gold'
import { writeAtomic } from '../store'
import { writeAcstaSql } from './acsta-sql'
import { applyFix } from './apply'
import { matchEvents } from './matching'
import { buildFixPlan, countChanges } from './plan'
import { fixReport } from './report'
import { readAppliedReports } from './reports-input'
import type { FixRun, FixRunOptions } from './run-types'
import { readFixSnapshot } from './snapshot'

/** 参考 URL の投稿 ID */
const statusIdOf = (url: string) => {
  const status = parseStatusUrl(url)
  return status === undefined ? [] : [status.id]
}

/**
 * 材料（ローカル D1・seed のレポート・emulate の結果・posts.jsonl）を読み、直しの計画を作って、レポートを書く。
 * apply のときだけ、変更があればバックアップを取ってからローカル D1 に書く。apply でなければ DB は readonly で開く。
 */
export const runFix = async (options: FixRunOptions): Promise<FixRun> => {
  const reportPath = assertInside(options.cacheRoot, options.reportPath, '--report')
  const acstaSqlPath =
    options.acstaSqlPath === undefined
      ? undefined
      : assertInside(options.cacheRoot, options.acstaSqlPath, '--acsta-sql')
  const today = jstDayOf(options.now)
  if (today === undefined) throw new Error(`now must be an ISO timestamp: ${options.now}`)
  const db = openLocalDb(options.dbPath, options.apply)
  try {
    assertColumns(checkColumns(db))
    const [entries, emulated, { nonBiccameStores }] = await Promise.all([
      readAppliedReports(options.reports),
      readSeedEvents(options.dir),
      readStoreMarks(options.charactersPath)
    ])
    const snapshot = readFixSnapshot(db)
    const { matched, unmatched } = matchEvents(snapshot.events, entries, emulated)
    // 今の参考 URL の投稿の種類を、posts.jsonl の 1 回の走査で引く
    const ids = new Set(matched.flatMap(({ event }) => event.references.flatMap((row) => statusIdOf(row.url))))
    const records = await sharedPostScan(resolve(options.dir, 'posts.jsonl'))(ids)
    const posts = new Map(
      [...records].map(([id, record]) => [id, { screenName: record.screenName, kind: record.kind }] as const)
    )
    const plan = buildFixPlan({
      matched,
      unmatched,
      posts,
      nonBiccameStores,
      today,
      blockers: snapshot.referencing,
      categories: snapshot.categories
    })
    const counts = countRows(db)
    const acstaSql =
      acstaSqlPath === undefined
        ? undefined
        : await writeAcstaSql(acstaSqlPath, resolve(options.dir, 'gold.json'), options.now, snapshot.categories)
    const run: FixRun = {
      plan,
      snapshot: {
        events: snapshot.events.length,
        foreignKeys: snapshot.foreignKeys,
        referencing: snapshot.referencing
      },
      counts,
      reports: options.reports,
      reportPath,
      ...(acstaSql === undefined ? {} : { acstaSql })
    }
    await writeAtomic(reportPath, `${JSON.stringify(fixReport(options, run), null, 2)}\n`)
    if (!options.apply || countChanges(plan) === 0) return run
    const backupPath = assertInside(
      options.cacheRoot,
      resolve(options.dir, `seed-backup-${compactStamp(options.now)}.sqlite`),
      'backup'
    )
    await mkdir(dirname(backupPath), { recursive: true })
    backupDatabase(db, backupPath)
    const copy = new Database(backupPath, { readonly: true })
    const backedUp = countRows(copy)
    copy.close()
    for (const table of TABLES)
      if (backedUp[table] !== counts[table])
        throw new Error(`backup ${table}: ${backedUp[table]} rows, expected ${counts[table]}`)
    const { before, after } = applyFix(db, plan, { now: options.now })
    return { ...run, applied: { backupPath, before, after } }
  } finally {
    db.close()
  }
}
