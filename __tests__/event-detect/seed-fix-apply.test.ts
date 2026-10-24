import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { countRows, readLocalState, type SeedEvent, selectSeedEvents } from '../../scripts/lib/event-detect/seed'
import { applyFix, buildFixPlan, countChanges, readFixSnapshot, runFix } from '../../scripts/lib/event-detect/seed-fix'
import { makeLocalDb } from '../fixtures/local-d1'
import { createSeedFixFixture, dump, fixOptions, refsOf } from './seed-fix-fixtures'
import { emulatedEvents, kinds, NON_BICCAME, NOW, SEEDED_AT, url } from './seed-fix-scenarios'

const { cleanup, setup, planOf } = createSeedFixFixture()
afterEach(cleanup)

describe('seed --fix --apply', () => {
  const DELETED = ['e-del-announce', 'e-del-start', 'e-del-both', 'e-del-bc', 'e-store', 'e-store-reply']
  const marks = DELETED.map(() => '?').join(', ')

  test('バックアップを取り、1 トランザクションで書く。リプライの告知・開始のイベントは子の行ごと消え、確認済みと引けなかった行・終了の行は変わらない', async () => {
    const { root, db, path, dir } = await setup()
    const before = dump(db)
    db.close()
    const run = await runFix(fixOptions(root, dir, path, { apply: true }))
    expect(run.applied).toBeDefined()
    // バックアップは書く前の状態
    const backupPath = run.applied?.backupPath
    if (backupPath === undefined) throw new Error('no backup')
    expect(backupPath.startsWith(join(dir, 'seed-backup-'))).toBe(true)
    const backup = new Database(backupPath, { readonly: true })
    expect(dump(backup)).toEqual(before)
    backup.close()

    const after = new Database(path, { readonly: true })
    // 削除: events と 3 つの子テーブルから消える
    for (const id of DELETED) {
      expect(after.query('SELECT id FROM events WHERE id = ?').get(id)).toBeNull()
      for (const table of ['event_stores', 'event_reference_urls', 'event_conditions'])
        expect(after.query(`SELECT id FROM ${table} WHERE event_id = ?`).all(id)).toEqual([])
    }
    // 参照されているイベントは残る（リプライの告知のまま）
    expect(refsOf(after, 'e-referenced')).toEqual([{ type: 'announce', url: url('4001') }])
    // 店舗が理由でも、参照されているイベントは残る
    expect(refsOf(after, 'e-store-referenced')).toEqual([{ type: 'announce', url: url('18001') }])
    // 参考 URL の行は UPDATE / INSERT されない。終了のリプライも、quote も、そのまま
    expect(refsOf(after, 'e-end-reply')).toEqual([
      { type: 'announce', url: url('5001') },
      { type: 'end', url: url('5002') }
    ])
    expect(refsOf(after, 'e-quote')).toEqual([{ type: 'announce', url: url('6001') }])
    // 残るイベントの参考 URL の行は 1 列も変わらない（バックアップと同じ行）
    const original = new Database(backupPath, { readonly: true })
    const keptRefs = `SELECT * FROM event_reference_urls WHERE event_id NOT IN (${marks}) ORDER BY id`
    expect(after.query(keptRefs).all(...DELETED)).toEqual(original.query(keptRefs).all(...DELETED))
    original.close()
    // ended_at（削除しないイベントだけ）
    const ended = (id: string) =>
      after.query<{ ended_at: string | null }, [string]>('SELECT ended_at FROM events WHERE id = ?').get(id)?.ended_at
    // 推定で入れる ended_at は Prisma の形式で書く。元からあった値は変えない
    expect(ended('e-stale-30')).toBe('2026-09-09T15:00:00.000+00:00')
    expect(ended('e-stale-29')).toBeNull()
    expect(ended('e-before-start')).toBeNull()
    expect(ended('e-has-ended')).toBe('2026-07-20T00:00:00.000Z')
    // 配布数
    const quantity = (id: string) =>
      after
        .query<{ limited_quantity: number | null; type: string; quantity: number | null }, [string]>(
          'SELECT e.limited_quantity, c.type, c.quantity FROM events e JOIN event_conditions c ON c.event_id = e.id WHERE e.id = ?'
        )
        .get(id)
    expect(quantity('e-over')).toEqual({ limited_quantity: null, type: 'everyone', quantity: null })
    expect(quantity('e-max')).toEqual({ limited_quantity: 1000, type: 'first_come', quantity: 1000 })
    // 確認済みと引けなかった行は、告知がリプライでも 1 列も変わらない
    const untouched = new Database(backupPath, { readonly: true })
    for (const id of ['e-verified', 'e-manual', 'e-store-verified', 'e-manual-store']) {
      for (const [table, column] of [
        ['events', 'id'],
        ['event_stores', 'event_id'],
        ['event_reference_urls', 'event_id'],
        ['event_conditions', 'event_id']
      ] as const)
        expect(after.query(`SELECT * FROM ${table} WHERE ${column} = ?`).all(id)).toEqual(
          untouched.query(`SELECT * FROM ${table} WHERE ${column} = ?`).all(id)
        )
    }
    untouched.close()
    // user_events は変わらない
    expect(after.query('SELECT * FROM user_events').all()).toEqual(before.user_events)
    after.close()
  })

  test('2 回目は変更 0 件（冪等）で、バックアップも書き込みもしない', async () => {
    const { root, db, path, dir } = await setup()
    db.close()
    await runFix(fixOptions(root, dir, path, { apply: true }))
    const written = new Database(path, { readonly: true })
    const afterFirst = dump(written)
    written.close()
    // 削除されたイベントはレポートに残っていても、D1 に行が無いので対応付けの対象にならない
    const second = await runFix(fixOptions(root, dir, path, { apply: true, now: '2026-10-10T03:05:00.000Z' }))
    // 残るのは「参照があるので削除しない」2 件（毎回 blocked のまま。書く変更ではない）
    expect(countChanges(second.plan)).toBe(0)
    expect(
      second.plan.events
        .filter((event) => event.outcome === 'blocked')
        .map((event) => event.eventId)
        .sort()
    ).toEqual(['e-referenced', 'e-store-referenced'])
    expect(second.applied).toBeUndefined()
    expect(readdirSync(dir).filter((name) => name.startsWith('seed-backup-'))).toHaveLength(1)
    const again = new Database(path, { readonly: true })
    expect(dump(again)).toEqual(afterFirst)
    again.close()
  })

  test('削除したイベントは、次の seed の新規作成でも最初の告知・開始がリプライのため作られず、作り直されない', async () => {
    const { root, db, path, dir } = await setup()
    db.close()
    await runFix(fixOptions(root, dir, path, { apply: true }))
    const written = new Database(path, { readonly: true })
    const local = readLocalState(written)
    written.close()
    // 削除で店舗・開始日の枠が空いた（ローカル D1 の照合では除かれない）
    for (const day of ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-13'])
      expect(local.storeDays.has(`kashiwa|${day}`)).toBe(false)
    expect(local.storeDays.has('biccamera|2026-07-16')).toBe(false)
    expect(local.storeDays.has('bicsim|2026-07-17')).toBe(false)
    const events: SeedEvent[] = emulatedEvents.map((event) => ({ ...event, posts: event.posts }))
    const selection = await selectSeedEvents({
      events,
      clef: new Map(events.map((event) => [event.posts[0].postId, 0.9] as const)),
      threshold: 0.7,
      gold: [],
      local,
      storeKeys: new Set(['kashiwa', ...NON_BICCAME]),
      nonBiccameStores: new Set(NON_BICCAME),
      names: [],
      lookupScreenNames: async (ids) =>
        new Map([...ids].filter((id) => id in kinds).map((id) => [id, 'bic_kashiwa'] as const)),
      lookupKinds: async (ids) => new Map([...ids].flatMap((id) => (id in kinds ? [[id, kinds[id]] as const] : []))),
      now: NOW
    })
    const created = selection.plans.map((plan) => plan.emulatedId)
    for (const id of ['kashiwa-1', 'kashiwa-2', 'kashiwa-3', 'kashiwa-13', 'biccamera-1', 'bicsim-1'])
      expect(created).not.toContain(id)
    // biccamera-1 は店舗が理由で外れる（bicsim-1 は最初の告知がリプライなので、その手前で外れる）
    expect(selection.notBiccameMusume).toEqual({ count: 1, byStore: [{ store: 'biccamera', count: 1 }] })
    expect(
      selection.replyFirst.announce + selection.replyFirst.start + selection.replyFirst.both
    ).toBeGreaterThanOrEqual(4)
  })

  test('書く行数が計画と合わなければロールバックして、DB は 1 列も変わらない', async () => {
    const { root, db, path, dir } = await setup()
    const plan = await planOf(root, dir, path)
    const before = dump(db)
    // 計画を作った後で、配布数を消す行が書き換えられた（WHERE の旧値に一致しなくなる）
    db.run("UPDATE events SET limited_quantity = 2000 WHERE id = 'e-over'")
    const tampered = dump(db)
    expect(tampered).not.toEqual(before)
    expect(() => applyFix(db, plan, { now: NOW })).toThrow('expected 1 row(s) changed but 0 changed')
    // 先に処理された他のイベントの削除も含め、全部ロールバックされている
    expect(dump(db)).toEqual(tampered)
    db.close()
  })

  test('削除の直前に他のテーブルが参照していたら、ロールバックして止まる', async () => {
    const { root, db, path, dir } = await setup()
    const plan = await planOf(root, dir, path)
    db.run(
      `INSERT INTO user_events (id, user_id, event_id, status, created_at, updated_at) VALUES ('ue-2', 'u-1', 'e-del-both', 'obtained', ?, ?)`,
      [SEEDED_AT, SEEDED_AT]
    )
    const before = dump(db)
    expect(() => applyFix(db, plan, { now: NOW })).toThrow('referenced by user_events')
    expect(dump(db)).toEqual(before)
    db.close()
  })

  test.each([0, 1])(
    'PRAGMA foreign_keys=%d のどちらでも、子の行を明示的に消して件数を検算する',
    async (foreignKeys) => {
      const { root, db, path, dir } = await setup()
      db.exec(`PRAGMA foreign_keys = ${foreignKeys}`)
      expect(readFixSnapshot(db).foreignKeys).toBe(foreignKeys)
      const plan = await planOf(root, dir, path)
      const before = countRows(db)
      const result = applyFix(db, plan, { now: NOW })
      // 削除する 6 件: events 1 + stores 1 + conditions 1 + 参考 URL（3 + 2 + 2 + 1 + 1 + 1 行）を消す
      expect(result.before).toEqual(before)
      expect(result.after.events).toBe(before.events - 6)
      expect(result.after.event_stores).toBe(before.event_stores - 6)
      expect(result.after.event_conditions).toBe(before.event_conditions - 6)
      expect(result.after.event_reference_urls).toBe(before.event_reference_urls - 10)
      db.close()
    }
  )

  test('.wrangler/state の外の DB・.cache の外のレポートは拒否する', async () => {
    const { root, db, dir } = await setup()
    db.close()
    await expect(runFix(fixOptions(root, dir, join(root, 'prod.sqlite')))).rejects.toThrow('.wrangler/state')
    const { path } = await makeLocalDb(root, 'other.sqlite')
    await expect(runFix(fixOptions(root, dir, path, { reportPath: join(root, 'report.json') }))).rejects.toThrow(
      '--report must be under'
    )
  })

  test('buildFixPlan: 対応が無ければ何も変えない', () => {
    const plan = buildFixPlan({
      matched: [],
      unmatched: [],
      posts: new Map(),
      nonBiccameStores: new Set(),
      today: '2026-10-10',
      blockers: []
    })
    expect(plan.events).toEqual([])
    expect(countChanges(plan)).toBe(0)
  })
})
