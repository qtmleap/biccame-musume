import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { applyFix, changedEvents, describeFix, runFix, summarizeFix } from '../../scripts/lib/event-detect/seed-fix'
import { createSeedFixFixture, dump, fixOptions } from './seed-fix-fixtures'
import { autoSpecs, NON_BICCAME, NOW, SEEDED_AT, url } from './seed-fix-scenarios'

const { cleanup, setup, planOf } = createSeedFixFixture()
afterEach(cleanup)
const MATCHED = autoSpecs.length

describe('seed --fix（dry-run）', () => {
  test('対象は is_verified=0 だけ。確認済みは載らず、手作りの行は「引けなかった」として触らない', async () => {
    const { root, db, path, dir } = await setup()
    const before = dump(db)
    db.close()
    const plan = await planOf(root, dir, path)
    const ids = plan.events.map((event) => event.eventId)
    expect(ids).not.toContain('e-verified')
    expect(ids).not.toContain('e-manual')
    expect(ids).not.toContain('e-store-verified')
    expect(ids).not.toContain('e-manual-store')
    expect(plan.unmatched.map(({ event, reason }) => [event.id, reason]).sort()).toEqual([
      ['e-manual', 'no_report_row'],
      ['e-manual-store', 'no_report_row']
    ])
    // 手作りの行は店舗がビッカメ娘でなくても触らない。件数だけ報告する
    expect(summarizeFix(plan).unmatchedNotBiccame).toBe(1)
    expect(plan.events).toHaveLength(MATCHED)
    // 書いていない
    const check = new Database(path, { readonly: true })
    expect(dump(check)).toEqual(before)
    check.close()
    expect(readdirSync(dir).filter((name) => name.startsWith('seed-backup-'))).toEqual([])
    expect(existsSync(join(dir, 'seed-fix-report.json'))).toBe(true)
  })

  test('告知か開始の参考 URL がリプライのイベントは削除の対象（告知だけ / 開始だけ / 両方）。参考 URL の行の差し替えはしない', async () => {
    const { root, db, path, dir } = await setup()
    db.close()
    const plan = await planOf(root, dir, path)
    const byId = new Map(plan.events.map((event) => [event.eventId, event]))
    expect(byId.get('e-del-announce')).toMatchObject({
      outcome: 'delete',
      replies: [{ type: 'announce', url: url('1001'), kind: 'reply' }],
      children: { event_stores: 1, event_reference_urls: 3, event_conditions: 1 }
    })
    expect(byId.get('e-del-start')).toMatchObject({
      outcome: 'delete',
      replies: [{ type: 'start', url: url('2002'), kind: 'reply' }]
    })
    expect(byId.get('e-del-both')?.replies.map((row) => row.type)).toEqual(['announce', 'start'])
    expect(plan.events.filter((event) => event.outcome === 'delete').map((event) => event.eventId)).toEqual(
      expect.arrayContaining(['e-del-announce', 'e-del-start', 'e-del-both', 'e-del-bc', 'e-store', 'e-store-reply'])
    )
    // 終了のリプライ・quote は削除しない
    expect(byId.get('e-end-reply')?.outcome).toBe('none')
    expect(byId.get('e-quote')?.outcome).toBe('none')
    const summary = summarizeFix(plan)
    // 削除の理由: リプライだけ 4（del-announce / del-start / del-both / del-bc）+ 店舗だけ 1（e-store）+ 両方 1（e-store-reply）
    expect(summary.deleted).toMatchObject({
      total: 6,
      reasons: { replyOnly: 4, storeOnly: 1, both: 1 },
      // リプライが理由のもの（店舗と重なる e-store-reply を含む）のうち、どちらがリプライだったか
      replyTypes: { total: 5, announceOnly: 3, startOnly: 1, both: 1 },
      // 店舗が理由のもの（リプライと重なる分を含む）の店舗別
      byStore: [
        { store: 'biccamera', count: 1 },
        { store: 'bicsim', count: 1 }
      ]
    })
    // 参考 URL を UPDATE / INSERT する計画は無い
    expect(JSON.stringify(plan.events)).not.toContain('"action"')
  })

  test('他のテーブルが参照しているイベントは削除せず、変更もしない（blocked）', async () => {
    const { root, db, path, dir } = await setup()
    db.close()
    const plan = await planOf(root, dir, path)
    const byId = new Map(plan.events.map((event) => [event.eventId, event]))
    expect(byId.get('e-referenced')).toMatchObject({
      outcome: 'blocked',
      blockedBy: [{ table: 'user_events', count: 1 }]
    })
    expect(plan.blockers.map(({ table }) => table).sort()).toEqual([
      'event_characters',
      'event_comments',
      'user_events'
    ])
    // 店舗が理由のイベントも、参照があれば削除しない
    expect(byId.get('e-store-referenced')).toMatchObject({
      outcome: 'blocked',
      notBiccame: true,
      blockedBy: [{ table: 'user_events', count: 1 }]
    })
    const changed = changedEvents(plan).map((event) => event.eventId)
    expect(changed).not.toContain('e-referenced')
    expect(changed).not.toContain('e-store-referenced')
  })

  test('対象キャラが明示されたイベントは seed の削除対象でも保護し、関連行も変更しない', async () => {
    const { root, db, path, dir } = await setup()
    db.run(
      `INSERT INTO event_characters (id, event_id, character_id, created_at, updated_at) VALUES ('ec-protected', 'e-del-announce', 'funato', ?, ?)`,
      [SEEDED_AT, SEEDED_AT]
    )
    const before = db.query("SELECT * FROM event_characters WHERE event_id='e-del-announce'").all()
    db.close()
    const plan = await planOf(root, dir, path)
    expect(plan.events.find((event) => event.eventId === 'e-del-announce')).toMatchObject({
      outcome: 'blocked',
      blockedBy: [{ table: 'event_characters', count: 1 }]
    })
    expect(changedEvents(plan).some((event) => event.eventId === 'e-del-announce')).toBe(false)
    const target = new Database(path)
    try {
      applyFix(target, plan, { now: NOW })
      expect(target.query("SELECT id FROM events WHERE id='e-del-announce'").all()).toHaveLength(1)
      expect(target.query("SELECT * FROM event_characters WHERE event_id='e-del-announce'").all()).toEqual(before)
    } finally {
      target.close()
    }
  })

  test('店舗がビッカメ娘ではないイベントは、リプライでなくても削除の対象。確認済みと手作りの行は対象外', async () => {
    const { root, db, path, dir } = await setup()
    db.close()
    const plan = await planOf(root, dir, path)
    const byId = new Map(plan.events.map((event) => [event.eventId, event]))
    expect(byId.get('e-store')).toMatchObject({ outcome: 'delete', notBiccame: true, replies: [] })
    expect(byId.get('e-store-reply')).toMatchObject({ outcome: 'delete', notBiccame: true })
    expect(byId.get('e-store-reply')?.replies).toHaveLength(1)
    // ビッカメ娘の店舗は、リプライでなければ削除しない
    expect(byId.get('e-quote')).toMatchObject({ outcome: 'none', notBiccame: false })
    expect([...plan.nonBiccameStores].sort()).toEqual([...NON_BICCAME].sort())
    expect(byId.has('e-store-verified')).toBe(false)
    expect(byId.has('e-manual-store')).toBe(false)
  })

  test('終了日の推定: ちょうど 30 日は入れ、29 日・開始日より前・実終了日ありは入れない', async () => {
    const { root, db, path, dir } = await setup()
    db.close()
    const plan = await planOf(root, dir, path)
    const byId = new Map(plan.events.map((event) => [event.eventId, event]))
    expect(byId.get('e-stale-30')).toMatchObject({
      endedState: 'estimated',
      endedAt: { day: '2026-09-10', iso: '2026-09-09T15:00:00.000Z' },
      outcome: 'change'
    })
    expect(byId.get('e-stale-29')).toMatchObject({ endedState: 'fresh', endedAt: null })
    expect(byId.get('e-before-start')).toMatchObject({ endedState: 'before_start', endedAt: null })
    expect(byId.get('e-has-ended')).toMatchObject({ endedState: 'has_end', endedAt: null })
    // 終了予定日がある（e-end-reply など）も推定しない
    expect(byId.get('e-end-reply')?.endedState).toBe('has_end')
  })

  test('配布数の上限: 1001 は消し、1000 は残す。確認済みの 5000 は対象外', async () => {
    const { root, db, path, dir } = await setup()
    db.close()
    const plan = await planOf(root, dir, path)
    const byId = new Map(plan.events.map((event) => [event.eventId, event]))
    expect(byId.get('e-over')?.quantity).toEqual({ from: 1001, conditionIds: ['e-over-cond'] })
    expect(byId.get('e-over')?.outcome).toBe('change')
    expect(byId.get('e-max')?.quantity).toBeNull()
    expect(byId.get('e-max')?.outcome).toBe('none')
    expect(plan.events.some((event) => event.eventId === 'e-verified')).toBe(false)
  })

  test('B・C は削除するイベントには当てない（集計にも数えない）', async () => {
    const { root, db, path, dir } = await setup()
    db.close()
    const plan = await planOf(root, dir, path)
    // e-del-bc は終了の情報が無く古い言及で、配布数 5000。残すイベントなら B・C の対象
    const deleted = plan.events.find((event) => event.eventId === 'e-del-bc')
    expect(deleted).toMatchObject({ outcome: 'delete', endedAt: null, quantity: null, endedState: 'has_end' })
    const summary = summarizeFix(plan)
    expect(summary.quantity).toBe(1)
    expect(summary.endedAt).toEqual({ estimated: 1, fresh: 1, beforeStart: 1 })
  })

  test('ログとレポートに削除の内訳・基準日が出る', async () => {
    const { root, db, path, dir } = await setup()
    db.close()
    const options = fixOptions(root, dir, path)
    const run = await runFix(options)
    const lines = describeFix(options, run).join('\n')
    expect(lines).toContain('--dry-run')
    expect(lines).toContain('基準日(JST)=2026-10-10')
    expect(lines).toContain('削除する自動作成分（is_verified=0）: 6 件 = リプライだけ 4 + 店舗だけ 1 + 両方 1')
    expect(lines).toContain('リプライが理由（店舗と重なる分を含む）: 5 件 = 告知だけ 3 + 開始だけ 1 + 両方 1')
    expect(lines).toContain('店舗が理由（リプライと重なる分を含む）: 2 件 = biccamera×1 bicsim×1')
    expect(lines).toContain('削除の理由に当たるが、他のテーブルが参照しているので削除しない（変更しない）: 2 件')
    expect(lines).toContain('対応が引けず触らないイベントのうち、店舗がビッカメ娘ではないもの: 1 件')
    expect(lines).toContain('参考 URL の行は UPDATE / DELETE / INSERT しない')
    expect(lines).toContain(
      '推定で入れる 1 件 / 最後の言及から 30 日未満で null のまま 1 件 / 開始日より前になるので入れない 1 件'
    )
    const report = JSON.parse(await readFile(options.reportPath, 'utf8'))
    expect(report.mode).toBe('dry-run')
    expect(report.summary.deleted).toMatchObject({ total: 6, reasons: { replyOnly: 4, storeOnly: 1, both: 1 } })
    expect(report.nonBiccameStores).toEqual([...NON_BICCAME].sort())
    expect(report.events.find((event: { eventId: string }) => event.eventId === 'e-store')).toMatchObject({
      outcome: 'delete',
      deleteReason: 'store'
    })
    expect(report.summary.matched).toBe(MATCHED)
    expect(report.deletedByStartYear).toEqual([{ year: '2026', count: 6 }])
  })
})
