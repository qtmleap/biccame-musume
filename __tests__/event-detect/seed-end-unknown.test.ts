import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import {
  estimateEnded,
  isEndUnknown,
  isStaleStart,
  readLocalState,
  type SeedEvent,
  STALE_ENDED_DAYS,
  selectSeedEvents
} from '../../scripts/lib/event-detect/seed'
import {
  applyFix,
  countChanges,
  describeFix,
  endUnknownByStartYear,
  readFixSnapshot,
  runFix,
  summarizeFix
} from '../../scripts/lib/event-detect/seed-fix'
import type { TitleTarget } from '../../scripts/lib/event-detect/seed-title'
import { at, dump, makeWorld, NOW, removeAll, rowsOf, tempRoot, type WorldEvent } from '../fixtures/fix-world'

// 終了が分からないまま止まっているイベント（終了予定日も終了日も無く、最後の言及が開始日より前で、開始が基準日の 30 日以上前）は、
// seed の新規作成から外し、seed --fix では削除する。基準日は 2026-10-10（JST）。一時の SQLite だけを使う。

const directories: string[] = []
afterEach(() => removeAll(directories))

/** 基準日（2026-10-10）の 30 日前 */
const THIRTY = '2026-09-10'
/** 基準日の 29 日前 */
const TWENTY_NINE = '2026-09-11'
/** 最後の言及が開始日より前になる日（どの開始日より前） */
const BEFORE_START = '2026-01-01T00:00:00.000Z'

describe('isStaleStart / isEndUnknown', () => {
  test('開始日がちょうど STALE_ENDED_DAYS 日前は古い。29 日前は古くない', () => {
    expect(STALE_ENDED_DAYS).toBe(30)
    expect(isStaleStart(THIRTY, '2026-10-10')).toBe(true)
    expect(isStaleStart(TWENTY_NINE, '2026-10-10')).toBe(false)
    // 未来の開始日は古くない
    expect(isStaleStart('2026-10-11', '2026-10-10')).toBe(false)
    expect(isStaleStart('2026-10-10', '2026-10-10')).toBe(false)
  })

  test('終了不明になるのは「最後の言及が開始日より前」で、開始が古いときだけ', () => {
    expect(isEndUnknown('before_start', THIRTY, '2026-10-10')).toBe(true)
    expect(isEndUnknown('before_start', TWENTY_NINE, '2026-10-10')).toBe(false)
    // 推定で終了日が入る・最後の言及が最近・終了の情報がある、はどれも終了不明ではない
    expect(isEndUnknown('estimated', '2020-01-01', '2026-10-10')).toBe(false)
    expect(isEndUnknown('fresh', '2020-01-01', '2026-10-10')).toBe(false)
    expect(isEndUnknown('has_end', '2020-01-01', '2026-10-10')).toBe(false)
  })

  test('estimateEnded との組み合わせ: 最後の言及が開始日と同じ日なら before_start ではない', () => {
    expect(estimateEnded(at('2026-07-01T00:00:00.000Z'), '2026-07-01', '2026-10-10').kind).toBe('estimated')
    expect(estimateEnded(at('2026-06-30T14:59:59.000Z'), '2026-07-01', '2026-10-10').kind).toBe('before_start')
  })
})

const events: WorldEvent[] = [
  // 開始がちょうど 30 日前で、最後の言及が開始日より前 → 削除
  { id: 'e-30', title: '30日前名刺', startDay: THIRTY, lastSeen: BEFORE_START },
  // 29 日前 → 残す（今も配布中かもしれない）
  { id: 'e-29', title: '29日前名刺', startDay: TWENTY_NINE, lastSeen: BEFORE_START },
  // 古い開始でも、最後の言及が開始日以降で 30 日以上前なら B で終了日が入る → 削除しない
  { id: 'e-b', title: '推定名刺', startDay: '2026-07-01', lastSeen: '2026-08-01T00:00:00.000Z' },
  // 古い開始で、最後の言及が最近（fresh）→ 削除しない
  { id: 'e-fresh', title: '最近名刺', startDay: '2026-07-02', lastSeen: '2026-10-05T00:00:00.000Z' },
  // B を前回適用済み（ended_at が入っている）→ 終了の情報があるので削除しない
  {
    id: 'e-b-done',
    title: '適用済み名刺',
    startDay: '2026-07-03',
    endedAt: '2026-08-01T00:00:00.000Z',
    lastSeen: BEFORE_START
  },
  // 終了予定日がある → 削除しない
  {
    id: 'e-planned',
    title: '予定名刺',
    startDay: '2026-07-04',
    endDate: '2026-07-31T00:00:00.000Z',
    lastSeen: BEFORE_START
  },
  // 参照されている → 削除しない（blocked）
  { id: 'e-ref', title: '参照名刺', startDay: '2026-07-05', lastSeen: BEFORE_START, referenced: true },
  // 確認済みは終了の情報が無くても削除しない（対象に入らない）
  { id: 'e-verified', title: '確認済み名刺', startDay: '2025-01-01', verified: true },
  // 手で作った is_verified=0（レポートに無い）→ 引けないので触らない
  { id: 'e-manual', title: '手作り名刺', startDay: '2025-01-02', auto: false },
  // 古い開始で最後の言及が前、もう 1 件（削除）
  { id: 'e-old', title: '古い名刺', startDay: '2019-05-01', lastSeen: '2019-04-01T00:00:00.000Z' }
]

const DELETED = ['e-30', 'e-old']

describe('seed --fix: 終了が分からないまま止まっているイベントの削除', () => {
  test('削除は 30 日前ちょうどの e-30 と古い e-old だけ。29 日前・B で入る・最近の言及・適用済み・予定あり・確認済み・手作りは残る', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    const before = dump(world.db)
    world.db.close()
    const run = await runFix(world.options())
    const byId = new Map(run.plan.events.map((event) => [event.eventId, event]))
    expect(
      run.plan.events
        .filter((event) => event.outcome === 'delete')
        .map((event) => event.eventId)
        .sort()
    ).toEqual([...DELETED].sort())
    expect(byId.get('e-30')).toMatchObject({
      outcome: 'delete',
      endUnknown: true,
      endedState: 'before_start',
      endedAt: null
    })
    expect(byId.get('e-29')).toMatchObject({ outcome: 'none', endUnknown: false, endedState: 'before_start' })
    // B を先に評価: 推定で入るものは削除せず、ended_at を入れる計画のまま
    expect(byId.get('e-b')).toMatchObject({
      outcome: 'change',
      endUnknown: false,
      endedState: 'estimated',
      endedAt: { day: '2026-08-01', iso: '2026-07-31T15:00:00.000Z' }
    })
    expect(byId.get('e-fresh')).toMatchObject({ outcome: 'none', endUnknown: false, endedState: 'fresh' })
    expect(byId.get('e-b-done')).toMatchObject({ outcome: 'none', endUnknown: false, endedState: 'has_end' })
    expect(byId.get('e-planned')).toMatchObject({ outcome: 'none', endUnknown: false, endedState: 'has_end' })
    // 参照があれば削除しない（変更もしない）
    expect(byId.get('e-ref')).toMatchObject({
      outcome: 'blocked',
      endUnknown: true,
      blockedBy: [{ table: 'user_events', count: 1 }]
    })
    // 確認済みと手作りは対象に入らない
    expect(byId.has('e-verified')).toBe(false)
    expect(byId.has('e-manual')).toBe(false)
    expect(run.plan.unmatched.map(({ event }) => event.id)).toEqual(['e-manual'])
    // dry-run は書かない
    const check = new Database(world.path, { readonly: true })
    expect(dump(check)).toEqual(before)
    check.close()
    expect(readdirSync(world.dir).filter((name) => name.startsWith('seed-backup-'))).toEqual([])
  })

  test('集計・ログ・レポート: 削除の理由に「終了が分からない」が入り、開始年別・残す例・触らない例も出る', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    world.db.close()
    const options = world.options()
    const run = await runFix(options)
    const summary = summarizeFix(run.plan)
    expect(summary.deleted).toMatchObject({
      total: 2,
      reasons: { replyOnly: 0, storeOnly: 0, both: 0, endUnknown: 2 },
      rows: { events: 2, event_stores: 2, event_reference_urls: 2, event_conditions: 2 }
    })
    // 最後の言及が最近のものは残す。参照があるものは blocked。手作りは対応が引けず、最後の言及が分からないので触らない
    expect(summary.endUnknown).toEqual({ deleted: 2, blocked: 1, freshKept: 1, unmatchedNoEnd: 1 })
    expect(endUnknownByStartYear(run.plan)).toEqual([
      { year: '2019', count: 1 },
      { year: '2026', count: 1 }
    ])
    const lines = describeFix(options, run).join('\n')
    expect(lines).toContain(
      '削除する自動作成分（is_verified=0）: 2 件 = リプライだけ 0 + 店舗だけ 0 + 両方 0 + 終了が分からない 2'
    )
    expect(lines).toContain('削除の合計に含む）: 2 件')
    expect(lines).toContain('開始年別: 2019=1 2026=1')
    expect(lines).toContain('kashiwa 2026-09-10 [30日前名刺]')
    expect(lines).toContain(
      '残す（終了の情報が無く開始が 30 日以上前だが、最後の言及が 30 日以内で今も配布中かもしれない）: 1 件'
    )
    expect(lines).toContain('kashiwa 2026-07-02 [最近名刺]')
    expect(lines).toContain('触らない（対応が引けず最後の言及が分からない。終了の情報が無く開始が 30 日以上前）: 1 件')
    expect(lines).toContain('[手作り名刺]')
    const report = JSON.parse(await readFile(options.reportPath, 'utf8'))
    expect(report.summary.deleted.reasons).toEqual({ replyOnly: 0, storeOnly: 0, both: 0, endUnknown: 2 })
    expect(report.endUnknownByStartYear).toEqual([
      { year: '2019', count: 1 },
      { year: '2026', count: 1 }
    ])
    expect(report.events.find((event: { eventId: string }) => event.eventId === 'e-30')).toMatchObject({
      outcome: 'delete',
      deleteReason: 'end_unknown'
    })
  })

  test('--apply: 子の行ごと消え、B は入り、確認済み・手作り・残す行は 1 列も変わらない', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    const untouched = ['e-29', 'e-fresh', 'e-b-done', 'e-planned', 'e-ref', 'e-verified', 'e-manual']
    const beforeRows = Object.fromEntries(untouched.map((id) => [id, rowsOf(world.db, id)]))
    const beforeAll = dump(world.db)
    world.db.close()
    const run = await runFix(world.options({ apply: true }))
    expect(run.applied).toBeDefined()
    const after = new Database(world.path, { readonly: true })
    for (const id of DELETED) {
      expect(rowsOf(after, id)).toEqual({
        events: [],
        event_stores: [],
        event_reference_urls: [],
        event_conditions: []
      })
    }
    for (const id of untouched) expect(rowsOf(after, id)).toEqual(beforeRows[id])
    // B: e-b に最後の言及の日が入る
    expect(
      after.query<{ ended_at: string | null }, []>("SELECT ended_at FROM events WHERE id = 'e-b'").get()?.ended_at
    ).toBe('2026-07-31T15:00:00.000Z')
    // user_events は変わらない
    expect(after.query('SELECT * FROM user_events').all()).toEqual(beforeAll.user_events)
    // 行数: 削除 2 件
    if (run.applied === undefined) throw new Error('not applied')
    expect(run.applied.after.events).toBe(run.applied.before.events - 2)
    after.close()
  })

  test('冪等: 2 回目は変更 0 件で、バックアップも書き込みもしない', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    world.db.close()
    await runFix(world.options({ apply: true }))
    const written = new Database(world.path, { readonly: true })
    const afterFirst = dump(written)
    written.close()
    const second = await runFix(world.options({ apply: true, now: '2026-10-10T03:05:00.000Z' }))
    expect(countChanges(second.plan)).toBe(0)
    expect(second.applied).toBeUndefined()
    expect(readdirSync(world.dir).filter((name) => name.startsWith('seed-backup-'))).toHaveLength(1)
    const again = new Database(world.path, { readonly: true })
    expect(dump(again)).toEqual(afterFirst)
    again.close()
  })

  test('書く直前に終了の情報が入っていたら、ロールバックして止まる', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    const run = await runFix(world.options())
    // 計画を作った後で、e-30 に終了予定日が入った
    world.db.run("UPDATE events SET end_date = '2026-09-30T00:00:00.000Z' WHERE id = 'e-30'")
    const before = dump(world.db)
    expect(() => applyFix(world.db, run.plan, { now: NOW })).toThrow('expected 1 row(s) changed but 0 changed')
    expect(dump(world.db)).toEqual(before)
    world.db.close()
  })

  test('B をまだ適用していない状態でも、B で入るものは削除しない（B → 終了不明の順に評価する）', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, [
      { id: 'e-b-1', title: '推定名刺', startDay: '2026-05-01', lastSeen: '2026-05-01T00:00:00.000Z' },
      { id: 'e-b-2', title: '推定名刺B', startDay: '2026-05-02', lastSeen: '2026-08-31T14:59:59.000Z' },
      // 最後の言及が開始日より 1 秒前（JST の暦日で前日）→ 推定できない → 削除
      { id: 'e-gone', title: '不明名刺', startDay: '2026-05-03', lastSeen: '2026-05-02T14:59:59.000Z' }
    ])
    world.db.close()
    const run = await runFix(world.options())
    const byId = new Map(run.plan.events.map((event) => [event.eventId, event]))
    expect(byId.get('e-b-1')).toMatchObject({ outcome: 'change', endedState: 'estimated' })
    expect(byId.get('e-b-2')).toMatchObject({ outcome: 'change', endedState: 'estimated' })
    expect(byId.get('e-gone')).toMatchObject({ outcome: 'delete', endUnknown: true })
    expect(summarizeFix(run.plan).endedAt).toEqual({ estimated: 2, fresh: 0, beforeStart: 0 })
  })

  test('スナップショットは確認済みも含む全イベントの題とカテゴリを持つ（acsta の付け替えに使う）', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    const snapshot = readFixSnapshot(world.db)
    world.db.close()
    expect(snapshot.categories).toHaveLength(events.length)
    expect(snapshot.categories.find((row) => row.id === 'e-verified')).toEqual({
      id: 'e-verified',
      title: '確認済み名刺',
      category: 'limited_card',
      isVerified: true
    })
  })
})

// ---------------------------------------------------------------------------------------------
// seed の新規作成
// ---------------------------------------------------------------------------------------------

const seedEvent = (init: Partial<SeedEvent> & { id: string }): SeedEvent => ({
  store: 'kashiwa',
  item: '夏名刺',
  category: 'limited_card',
  startDate: '2026-07-01',
  firstSeen: 1,
  lastSeen: at('2026-09-30T00:00:00.000Z'),
  posts: [{ postId: `${init.id}-1`, status: 'announce' }],
  ...init
})

const everyone = async (ids: ReadonlySet<string>) => new Map([...ids].map((id) => [id, 'bic_kashiwa'] as const))
const allOriginal = async (ids: ReadonlySet<string>) => new Map([...ids].map((id) => [id, 'original' as const]))

const selectOptions = (list: readonly SeedEvent[]) => ({
  events: list,
  clef: new Map(list.map((event) => [event.posts[0].postId, 0.9] as const)),
  threshold: 0.7,
  gold: [],
  storeKeys: new Set(['kashiwa']),
  names: [],
  lookupScreenNames: everyone,
  lookupKinds: allOriginal,
  now: NOW
})

const END_UNKNOWN_STAGE = '終了不明のまま止まっていない'

describe('seed の新規作成: 終了が分からないまま止まっているイベントは作らない', () => {
  const list = [
    seedEvent({ id: 'old-30', startDate: THIRTY, lastSeen: at(BEFORE_START) }),
    seedEvent({ id: 'old-29', startDate: TWENTY_NINE, lastSeen: at(BEFORE_START) }),
    // B で終了日が入る（最後の言及が開始日以降で 30 日以上前）
    seedEvent({ id: 'b', startDate: '2026-07-01', lastSeen: at('2026-08-01T00:00:00.000Z') }),
    seedEvent({ id: 'fresh', startDate: '2026-07-02', lastSeen: at('2026-10-05T00:00:00.000Z') }),
    seedEvent({ id: 'ended', startDate: '2026-07-03', endedAt: '2026-07-20', lastSeen: at(BEFORE_START) }),
    seedEvent({ id: 'planned', startDate: '2026-07-04', endDate: '2026-07-31', lastSeen: at(BEFORE_START) }),
    // 終了予定日が開始日より前で使えず、終了日も無い → 終了の情報が無い扱い → 作らない
    seedEvent({ id: 'bad-end', startDate: '2026-07-05', endDate: '2026-07-01', lastSeen: at(BEFORE_START) })
  ]

  test('開始が基準日の 30 日前ちょうどは作らず、29 日前は作る。B で入る・最近の言及・終了の情報ありは作る', async () => {
    const selection = await selectSeedEvents(selectOptions(list))
    expect(selection.plans.map((plan) => plan.emulatedId).sort()).toEqual(['b', 'ended', 'fresh', 'old-29', 'planned'])
    expect(selection.endUnknown).toBe(2)
    const stage = selection.stages.find((entry) => entry.label.startsWith(END_UNKNOWN_STAGE))
    expect(stage).toEqual({ label: expect.any(String), excluded: 2, remaining: 5 })
    // 作る側の B は変わらない
    expect(selection.plans.find((plan) => plan.emulatedId === 'b')).toMatchObject({
      endedAtEstimated: true,
      endedAt: '2026-07-31T15:00:00.000Z'
    })
    // 段階は続けてつながる
    selection.stages.slice(1).forEach((entry, index) => {
      expect(entry.remaining + entry.excluded).toBe(selection.stages[index].remaining)
    })
    expect(selection.stages.at(-1)?.remaining).toBe(selection.plans.length)
  })

  test('段階は店舗キーの絞り込みの後・命名の前。作らないイベントのために命名を呼ばない', async () => {
    const requested: string[] = []
    const naming = {
      system: 'SYS',
      lookupBodies: async () => new Map<string, string>(),
      run: async (targets: readonly TitleTarget[]) => {
        requested.push(...targets.map((target) => target.request.state))
        return {
          titles: new Map<string, string>(),
          progress: {
            total: targets.length,
            done: targets.length,
            cached: 0,
            called: 0,
            failed: targets.length,
            stats: { rateLimited: 0, serverErrors: 0, invalid: 0 },
            inputTokens: 0,
            outputTokens: 0
          }
        }
      }
    }
    const selection = await selectSeedEvents({ ...selectOptions(list), naming })
    expect(requested).toHaveLength(5)
    const labels = selection.stages.map((entry) => entry.label)
    const index = labels.findIndex((label) => label.startsWith(END_UNKNOWN_STAGE))
    expect(labels[index - 1]).toContain('StoreKeySchema')
    expect(labels[index + 1]).toContain('題を付けられる')
  })

  test('削除したイベントは次の seed でも作り直されない（同じ条件で外れ、店舗・開始日の枠が空いても作られない）', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    world.db.close()
    await runFix(world.options({ apply: true }))
    const written = new Database(world.path, { readonly: true })
    const local = readLocalState(written)
    written.close()
    // 削除で店舗・開始日の枠が空いた（ローカル D1 の照合では除かれない）
    expect(local.storeDays.has(`kashiwa|${THIRTY}`)).toBe(false)
    expect(local.storeDays.has('kashiwa|2019-05-01')).toBe(false)
    // 削除した 2 件と同じ emulate のイベント
    const gone = world.emulated.filter((event) => ['emu-e-30', 'emu-e-old'].includes(event.id))
    expect(gone).toHaveLength(2)
    const seeded = gone.map((event) => seedEvent({ ...event, posts: event.posts }))
    const selection = await selectSeedEvents({ ...selectOptions(seeded), local })
    expect(selection.plans).toEqual([])
    expect(selection.endUnknown).toBe(2)
  })
})
