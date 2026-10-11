import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DetectPostKind } from '@biccame/shared/event-detect/post'
import {
  countRows,
  jstDayToUtcIso,
  readLocalState,
  type SeedEvent,
  selectSeedEvents
} from '../../scripts/lib/event-detect/seed'
import {
  applyFix,
  buildFixPlan,
  changedEvents,
  countChanges,
  describeFix,
  type FixRunOptions,
  matchEvents,
  readFixSnapshot,
  runFix,
  summarizeFix
} from '../../scripts/lib/event-detect/seed-fix'
import { makeLocalDb } from '../fixtures/local-d1'

// seed --fix: 自動作成分（is_verified=0）のうち、告知か開始の参考 URL がリプライのイベントを削除し、残すイベントの終了日・配布数を直す。一時の SQLite だけを使う。

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const tempDir = async () => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-seed-fix-'))
  directories.push(path)
  return path
}

/** JST の 2026-10-10 12:00 */
const NOW = '2026-10-10T03:00:00.000Z'
/** seed --apply が自動作成分を INSERT した時刻（レポートの generatedAt と D1 の created_at） */
const SEEDED_AT = '2026-10-09T13:24:28.130Z'
const at = (iso: string) => Date.parse(iso)
const url = (id: string, screenName = 'bic_kashiwa') => `https://x.com/${screenName}/status/${id}`

type RefRow = { type: 'announce' | 'start' | 'end'; id: string; kind: DetectPostKind }

type EventSpec = {
  /** D1 の events.id */
  id: string
  /** emulate のイベント ID。レポートの emulatedId */
  emulatedId: string
  title: string
  store?: string
  startDay?: string
  verified?: boolean
  createdAt?: string
  endDate?: string | null
  endedAt?: string | null
  limitedQuantity?: number | null
  /** 参考 URL の行。投稿 ID と種類は posts.jsonl にも、emulate の言及（古い順）にもそのまま入る */
  refs: RefRow[]
  lastSeen?: number
  /** first_come の配布条件を持たせる配布数 */
  conditionQuantity?: number | null
}

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

const ref = (type: RefRow['type'], id: string, kind: DetectPostKind): RefRow => ({ type, id, kind })

const specs: EventSpec[] = [
  // 告知だけがリプライ → 削除
  {
    id: 'e-del-announce',
    emulatedId: 'kashiwa-1',
    title: '夏名刺',
    startDay: '2026-07-01',
    endDate: '2026-07-31',
    refs: [ref('announce', '1001', 'reply'), ref('start', '1002', 'original'), ref('end', '1003', 'original')]
  },
  // 開始だけがリプライ → 削除
  {
    id: 'e-del-start',
    emulatedId: 'kashiwa-2',
    title: '秋名刺',
    startDay: '2026-07-02',
    endDate: '2026-07-31',
    refs: [ref('announce', '2001', 'original'), ref('start', '2002', 'reply')]
  },
  // 告知も開始もリプライ → 削除（両方）
  {
    id: 'e-del-both',
    emulatedId: 'kashiwa-3',
    title: '冬名刺',
    startDay: '2026-07-03',
    endDate: '2026-07-31',
    refs: [ref('announce', '3001', 'reply'), ref('start', '3002', 'reply')]
  },
  // 告知がリプライだが user_events が参照している → 削除しない（変更しない）
  {
    id: 'e-referenced',
    emulatedId: 'kashiwa-4',
    title: '参照あり名刺',
    startDay: '2026-07-04',
    endDate: '2026-07-31',
    refs: [ref('announce', '4001', 'reply')]
  },
  // 終了だけがリプライ → 問題にしない（そのまま）
  {
    id: 'e-end-reply',
    emulatedId: 'kashiwa-5',
    title: '終了リプライ名刺',
    startDay: '2026-07-05',
    endDate: '2026-07-31',
    refs: [ref('announce', '5001', 'original'), ref('end', '5002', 'reply')]
  },
  // 告知が quote → そのまま
  {
    id: 'e-quote',
    emulatedId: 'kashiwa-6',
    title: '引用名刺',
    startDay: '2026-07-06',
    endDate: '2026-07-31',
    refs: [ref('announce', '6001', 'quote')]
  },
  // 終了の情報が無く、最後の言及からちょうど 30 日 → ended_at を入れる
  {
    id: 'e-stale-30',
    emulatedId: 'kashiwa-7',
    title: '30日名刺',
    startDay: '2026-07-07',
    refs: [ref('announce', '7001', 'original')],
    lastSeen: at('2026-09-10T14:59:59.000Z')
  },
  // 29 日 → null のまま
  {
    id: 'e-stale-29',
    emulatedId: 'kashiwa-8',
    title: '29日名刺',
    startDay: '2026-07-08',
    refs: [ref('announce', '8001', 'original')],
    lastSeen: at('2026-09-10T15:00:00.000Z')
  },
  // 最後の言及が開始日より前 → 入れない（開始が 30 日未満前なので、終了が分からなくても削除しない）
  {
    id: 'e-before-start',
    emulatedId: 'kashiwa-9',
    title: '前名刺',
    startDay: '2026-09-25',
    refs: [ref('announce', '9001', 'original')],
    lastSeen: at('2026-06-01T00:00:00.000Z')
  },
  // 実終了日がある → 推定しない
  {
    id: 'e-has-ended',
    emulatedId: 'kashiwa-10',
    title: '終了済み名刺',
    startDay: '2026-07-10',
    endedAt: '2026-07-20T00:00:00.000Z',
    refs: [ref('announce', '10001', 'original')],
    lastSeen: at('2026-08-01T00:00:00.000Z')
  },
  // 配布数 1001 → 消す
  {
    id: 'e-over',
    emulatedId: 'kashiwa-11',
    title: '1001名刺',
    startDay: '2026-07-11',
    endDate: '2026-07-31',
    limitedQuantity: 1001,
    refs: [ref('announce', '11001', 'original')]
  },
  // 配布数 1000 → そのまま
  {
    id: 'e-max',
    emulatedId: 'kashiwa-12',
    title: '1000名刺',
    startDay: '2026-07-12',
    endDate: '2026-07-31',
    limitedQuantity: 1000,
    refs: [ref('announce', '12001', 'original')]
  },
  // 削除するイベントには B・C を当てない（終了の情報が無く古い言及・配布数 5000 でも、削除するだけ）
  {
    id: 'e-del-bc',
    emulatedId: 'kashiwa-13',
    title: '削除B C名刺',
    startDay: '2026-07-13',
    limitedQuantity: 5000,
    refs: [ref('announce', '13001', 'reply')],
    lastSeen: at('2026-08-01T00:00:00.000Z')
  },
  // 確認済みは告知がリプライでも触らない（レポートにも載っていない）
  {
    id: 'e-verified',
    emulatedId: 'kashiwa-14',
    title: '確認済み名刺',
    startDay: '2026-07-14',
    verified: true,
    createdAt: '2026-01-13T07:11:25.449Z',
    limitedQuantity: 5000,
    refs: [ref('announce', '14001', 'reply')]
  },
  // 手で作った is_verified=0（レポートに無い）→ 引けないので触らない
  {
    id: 'e-manual',
    emulatedId: 'kashiwa-15',
    title: '手作り名刺',
    startDay: '2026-07-15',
    createdAt: '2026-02-04T14:43:23.980+00:00',
    limitedQuantity: 5000,
    refs: [ref('announce', '15001', 'reply')]
  },
  // ビッカメ娘ではない店舗（biccamera）→ リプライでなくても削除（店舗だけ）
  {
    id: 'e-store',
    emulatedId: 'biccamera-1',
    title: 'ビックカメラ名刺',
    store: 'biccamera',
    startDay: '2026-07-16',
    endDate: '2026-07-31',
    refs: [ref('announce', '16001', 'original')]
  },
  // ビッカメ娘ではない店舗で、告知もリプライ → 削除（両方）
  {
    id: 'e-store-reply',
    emulatedId: 'bicsim-1',
    title: 'シム名刺',
    store: 'bicsim',
    startDay: '2026-07-17',
    endDate: '2026-07-31',
    refs: [ref('announce', '17001', 'reply')]
  },
  // 店舗が理由だが user_events が参照している → 削除しない（変更しない）
  {
    id: 'e-store-referenced',
    emulatedId: 'naisen-1',
    title: '参照ありナイセン名刺',
    store: 'naisen',
    startDay: '2026-07-18',
    refs: [ref('announce', '18001', 'original')]
  },
  // 確認済みは店舗がビッカメ娘でなくても触らない（実データには無いが、不変であることを確かめる）
  {
    id: 'e-store-verified',
    emulatedId: 'biccamera-2',
    title: '確認済みビックカメラ名刺',
    store: 'biccamera',
    startDay: '2026-07-19',
    verified: true,
    createdAt: '2026-01-13T07:11:25.449Z',
    refs: [ref('announce', '19001', 'original')]
  },
  // 手で作った is_verified=0 のビッカメ娘でない店舗 → 引けないので触らない（件数だけ報告する）
  {
    id: 'e-manual-store',
    emulatedId: 'biccamera-3',
    title: '手作りビックカメラ名刺',
    store: 'biccamera',
    startDay: '2026-07-20',
    createdAt: '2026-02-04T14:43:23.980+00:00',
    refs: [ref('announce', '20001', 'original')]
  }
]

/** 投稿 ID → 種類（posts.jsonl） */
const kinds: Record<string, DetectPostKind> = Object.fromEntries(
  specs.flatMap((spec) => spec.refs.map((row) => [row.id, row.kind] as const))
)

/** レポートに載り、seed --fix が対応を引ける自動作成分（確認済みと手作りを除く） */
const autoSpecs = specs.filter((spec) => spec.verified !== true && !spec.id.startsWith('e-manual'))

const storeOf = (spec: EventSpec) => (spec.store === undefined ? 'kashiwa' : spec.store)

/** ビッカメ娘ではない店舗（characters.json の is_biccame_musume が false） */
const NON_BICCAME = ['biccamera', 'bicsim', 'naisen']

const emulatedEvents = specs.map((spec) => ({
  id: spec.emulatedId,
  store: storeOf(spec),
  item: spec.title,
  category: 'limited_card' as const,
  status: 'end',
  startDate: spec.startDay === undefined ? '2026-07-01' : spec.startDay,
  startUnknown: false,
  firstSeen: at('2026-06-01T00:00:00.000Z'),
  lastSeen: spec.lastSeen === undefined ? at('2026-08-01T00:00:00.000Z') : spec.lastSeen,
  // 言及は参考 URL と同じ投稿（種別ごとに 1 件、古い順）
  posts: spec.refs.map((row) => ({ postId: row.id, status: row.type, index: 0 }))
}))

/** seed が書いたレポート。確認済みと手作りの行は載っていない */
const reportFor = (generatedAt: string) => ({
  generatedAt,
  events: autoSpecs.map((spec) => ({
    emulatedId: spec.emulatedId,
    store: storeOf(spec),
    startDate: spec.startDay === undefined ? '2026-07-01' : spec.startDay,
    title: spec.title
  }))
})

const makeMaterials = async (root: string, db: Database) => {
  const dir = join(root, '.cache', 'event-detect')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'emulated-v1.json'), JSON.stringify(emulatedEvents))
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

const fixOptions = (root: string, dir: string, dbPath: string, extra: Partial<FixRunOptions> = {}): FixRunOptions => ({
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

const dump = (db: Database) => ({
  events: db.query('SELECT * FROM events ORDER BY id').all(),
  event_stores: db.query('SELECT * FROM event_stores ORDER BY id').all(),
  event_reference_urls: db.query('SELECT * FROM event_reference_urls ORDER BY id').all(),
  event_conditions: db.query('SELECT * FROM event_conditions ORDER BY id').all(),
  user_events: db.query('SELECT * FROM user_events ORDER BY id').all()
})

const refsOf = (db: Database, eventId: string) =>
  db
    .query<{ type: string; url: string }, [string]>(
      'SELECT type, url FROM event_reference_urls WHERE event_id = ? ORDER BY type'
    )
    .all(eventId)

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
    expect(plan.blockers.map(({ table }) => table).sort()).toEqual(['event_comments', 'user_events'])
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

describe('matchEvents（1 対 1 の対応）', () => {
  const entriesOf = () => reportFor(SEEDED_AT).events.map((entry) => ({ ...entry, generatedAt: SEEDED_AT }))
  const emulatedOf = () =>
    emulatedEvents.map((event) => ({ ...event, posts: event.posts.map(({ postId, status }) => ({ postId, status })) }))

  test('作成時刻・店舗・開始日・題が全部一致するときだけ対応する。emulate の店舗か開始日が違えば対応しない', async () => {
    const { db } = await setup()
    const snapshot = readFixSnapshot(db)
    db.close()
    const entries = entriesOf()
    const emulated = emulatedOf()
    const ok = matchEvents(snapshot.events, entries, emulated)
    expect(ok.matched).toHaveLength(MATCHED)
    expect(ok.unmatched.map(({ reason }) => reason)).toEqual(['no_report_row', 'no_report_row'])

    // レポートの generatedAt が違う（別の実行で作った行を取り違えない）
    const later = matchEvents(
      snapshot.events,
      entries.map((entry) => ({ ...entry, generatedAt: '2026-10-09T14:48:52.679Z' })),
      emulated
    )
    expect(later.matched).toHaveLength(0)

    // emulate のイベントの開始日がレポートと違う（emulate をやり直して ID がずれた）
    const shifted = emulated.map((event) => (event.id === 'kashiwa-1' ? { ...event, startDate: '2026-07-02' } : event))
    const mismatch = matchEvents(snapshot.events, entries, shifted)
    expect(mismatch.unmatched.find(({ event }) => event.id === 'e-del-announce')?.reason).toBe('emulated_mismatch')
    const missing = matchEvents(
      snapshot.events,
      entries,
      emulated.filter((event) => event.id !== 'kashiwa-1')
    )
    expect(missing.unmatched.find(({ event }) => event.id === 'e-del-announce')?.reason).toBe('emulated_missing')
  })

  test('レポートに同じ組で別の emulatedId が 2 行あれば対応しない。D1 に同じ組が 2 件あっても対応しない', async () => {
    const { db } = await setup()
    const snapshot = readFixSnapshot(db)
    db.close()
    const entries = entriesOf()
    const emulated = emulatedOf()
    const twin = entries.find((entry) => entry.emulatedId === 'kashiwa-1')
    if (twin === undefined) throw new Error('no twin')
    const ambiguous = matchEvents(snapshot.events, [...entries, { ...twin, emulatedId: 'kashiwa-99' }], emulated)
    expect(ambiguous.unmatched.find(({ event }) => event.id === 'e-del-announce')?.reason).toBe('ambiguous_report')
    // 同じレポートを 2 回渡しても（同じ emulatedId なので）曖昧にはならない
    expect(matchEvents(snapshot.events, [...entries, ...entries], emulated).matched).toHaveLength(MATCHED)
    const copy = snapshot.events.find((event) => event.id === 'e-del-announce')
    if (copy === undefined) throw new Error('no event')
    const duplicated = matchEvents([...snapshot.events, { ...copy, id: 'e-copy' }], entries, emulated)
    expect(
      duplicated.unmatched
        .filter(({ reason }) => reason === 'ambiguous_d1')
        .map(({ event }) => event.id)
        .sort()
    ).toEqual(['e-copy', 'e-del-announce'])
  })
})

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
    expect(ended('e-stale-30')).toBe('2026-09-09T15:00:00.000Z')
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
