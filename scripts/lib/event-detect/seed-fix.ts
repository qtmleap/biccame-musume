import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { DetectPostKind } from '@biccame/shared/event-detect/post'
import { z } from 'zod'
import { parseStatusUrl } from './gold'
import {
  assertColumns,
  assertInside,
  backupDatabase,
  checkColumns,
  compactStamp,
  countRows,
  estimateEnded,
  isEndUnknown,
  isReplyKind,
  isStaleStart,
  jstDayOf,
  jstDayToUtcIso,
  judgeAcsta,
  MAX_LIMITED_QUANTITY,
  openLocalDb,
  type PostInfo,
  readSeedEvents,
  readStoreMarks,
  type ReferenceType,
  type RowCounts,
  type SeedEvent,
  STALE_ENDED_DAYS,
  sharedPostScan,
  TABLES
} from './seed'
import { readGold, writeAtomic } from './store'

// seed --fix: seed で作った自動作成分（events.is_verified=0）を、今の規則で直す。ローカル D1（.wrangler/state）だけが対象。
//   1. 告知か開始の参考 URL がリプライの投稿のイベント、または店舗がビッカメ娘ではない（characters.json の is_biccame_musume が false）
//      イベントは、イベントごと削除する（子の行も明示的に消す）。他のテーブルが参照していれば削除しない。
//      参考 URL の行を別の投稿に差し替えることはしない（終了の参考 URL がリプライなのは問題にしない）
//   2. 削除しないイベントのうち、終了予定日も終了日も無く、最後の言及から STALE_ENDED_DAYS 日以上たったものに、最後の言及の日を ended_at として入れる
//   3. 削除しないイベントのうち、配布数が MAX_LIMITED_QUANTITY を超えるものは、limited_quantity を消し、配布条件を everyone にする
//   4. 終了が分からないまま止まっているイベント（終了予定日も終了日も無く、最後の言及が開始日より前で終了日を推定できず、開始が
//      基準日の STALE_ENDED_DAYS 日以上前。isEndUnknown）は、2 を先に評価して入らなかったものを、イベントごと削除する
//   5. 題がアクスタ（アクスタ・アクリルスタンド。アクキーを含まない）で category が other のイベントを acsta に付け替える（judgeAcsta）。
//      これだけは確認済み（is_verified=1）の行と、seed が作ったと確かめられない行も対象にする（題で決まる規則で、emulate のイベントとの対応は要らない）
// 1〜3 の削除・変更は、確認済み（is_verified=1）の行と、seed が作ったと確かめられない行には触れない（5 の category だけが例外）。
// 自動作成分とそのイベントの元（emulate のイベント）の対応は、seed --apply が書いたレポートの (店舗, 開始日, 題, 作成時刻) で 1 対 1 に引く。

// ---------------------------------------------------------------------------------------------
// 入力
// ---------------------------------------------------------------------------------------------

/** seed --apply が書いたレポートのうち、対応付けに使う項目だけ */
const AppliedReportSchema = z.object({
  generatedAt: z.string().nonempty(),
  events: z.array(
    z.object({
      emulatedId: z.string().nonempty(),
      store: z.string().nonempty(),
      startDate: z.string().nonempty(),
      title: z.string().nonempty()
    })
  )
})

/** レポートの 1 行。generatedAt は seed がその行を INSERT した時刻（D1 の created_at と同じ） */
export type ReportEntry = {
  emulatedId: string
  store: string
  startDate: string
  title: string
  generatedAt: string
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** seed --apply が書いたレポート（--report の出力）を読む。無い・形が合わないときは止まる */
export const readAppliedReports = async (paths: readonly string[]): Promise<ReportEntry[]> => {
  const reports = await Promise.all(
    paths.map(async (path) => {
      if (!existsSync(path)) throw new Error(`${path}: not found`)
      const parsed = AppliedReportSchema.safeParse(parseJson(await readFile(path, 'utf8')))
      if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`)
      return parsed.data.events.map((entry): ReportEntry => ({ ...entry, generatedAt: parsed.data.generatedAt }))
    })
  )
  return reports.flat()
}

// ---------------------------------------------------------------------------------------------
// ローカル D1 の状態
// ---------------------------------------------------------------------------------------------

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

/** イベントを消すとき、イベントと一緒に明示的に消す子テーブル。これ以外の参照があるイベントは消さない */
const OWNED_TABLES: readonly string[] = ['event_stores', 'event_reference_urls', 'event_conditions']

const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** events を参照するテーブルと列。ハードコードせず、スキーマ（外部キー）から探す。後から増えたテーブルも拾う */
const findReferencing = (db: Database): ReferencingTable[] =>
  db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
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

/** 比較の差を順に見て、最初に 0 でないものを返す */
const chain = (...diffs: number[]) => diffs.reduce((first, diff) => (first !== 0 ? first : diff), 0)

/** Map のキーに行を足す（無ければ新しい配列を作る） */
const pushTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const group = map.get(key)
  if (group) group.push(value)
  else map.set(key, [value])
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
    parseRows(StoreRowSchema, db.query(`SELECT event_id, store_key FROM event_stores WHERE event_id IN ${UNVERIFIED}`).all(), 'event_stores')
  )
  const references = byEvent(
    parseRows(
      ReferenceRowSchema,
      db
        .query(`SELECT id, event_id, type, url FROM event_reference_urls WHERE event_id IN ${UNVERIFIED} ORDER BY created_at, id`)
        .all(),
      'event_reference_urls'
    )
  )
  const conditions = byEvent(
    parseRows(
      ConditionRowSchema,
      db.query(`SELECT id, event_id, type, quantity FROM event_conditions WHERE event_id IN ${UNVERIFIED} ORDER BY id`).all(),
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

// ---------------------------------------------------------------------------------------------
// 対応付け
// ---------------------------------------------------------------------------------------------

export type MatchedEvent = { event: SnapshotEvent; entry: ReportEntry; emulated: SeedEvent; store: string; startDay: string }

/**
 * 対応が引けなかった理由。
 *  multiple_stores=店舗が 1 つではない / no_start_day=開始日を読めない / no_report_row=レポートに同じ (店舗, 開始日, 題, 作成時刻) の行が無い /
 *  ambiguous_report=レポートに同じ組で別の emulate のイベントを指す行が複数ある / ambiguous_d1=D1 に同じ組のイベントが複数ある /
 *  emulated_missing=レポートの emulatedId が emulate の結果に無い / emulated_mismatch=その emulate のイベントの店舗か開始日がレポートの行と違う
 */
export type UnmatchedReason =
  | 'multiple_stores'
  | 'no_start_day'
  | 'no_report_row'
  | 'ambiguous_report'
  | 'ambiguous_d1'
  | 'emulated_missing'
  | 'emulated_mismatch'

export type UnmatchedEvent = { event: SnapshotEvent; reason: UnmatchedReason }

/** (店舗, 開始日, 題, 作成時刻) の組。作成時刻はレポートの generatedAt と D1 の created_at が一致するはずなので、手で作った行を除く鍵になる */
const matchKey = (store: string, day: string, title: string, createdAt: string) =>
  JSON.stringify([store, day, title, createdAt])

/**
 * is_verified=0 のイベントと emulate のイベントを、レポートで 1 対 1 に結ぶ。
 * D1 の (店舗, 開始日の JST 暦日, 題, created_at) がレポートの (store, startDate, title, generatedAt) とちょうど 1 行ずつ対応し、
 * そのレポートの emulatedId の emulate のイベントの店舗・開始日もレポートと同じであること。引けなかったイベントは触らない。
 */
export const matchEvents = (
  events: readonly SnapshotEvent[],
  entries: readonly ReportEntry[],
  emulated: readonly SeedEvent[]
): { matched: MatchedEvent[]; unmatched: UnmatchedEvent[] } => {
  const reportIndex = new Map<string, ReportEntry[]>()
  for (const entry of entries) {
    const key = matchKey(entry.store, entry.startDate, entry.title, entry.generatedAt)
    // 同じ行が複数のレポートに重複していても、同じ emulate のイベントを指すなら 1 行と数える
    const known = reportIndex.get(key)
    if (known === undefined || !known.some((row) => row.emulatedId === entry.emulatedId)) pushTo(reportIndex, key, entry)
  }
  const emulatedIndex = new Map(emulated.map((event) => [event.id, event] as const))
  const keyed = events.map((event) => {
    const day = jstDayOf(event.startDate)
    const [store] = event.stores
    const key =
      event.stores.length === 1 && day !== undefined && store !== undefined
        ? matchKey(store, day, event.title, event.createdAt)
        : undefined
    return { event, store, day, key }
  })
  const d1Counts = new Map<string, number>()
  for (const { key } of keyed) {
    if (key === undefined) continue
    const known = d1Counts.get(key)
    d1Counts.set(key, known === undefined ? 1 : known + 1)
  }
  const matched: MatchedEvent[] = []
  const unmatched: UnmatchedEvent[] = []
  for (const { event, store, day, key } of keyed) {
    const reject = (reason: UnmatchedReason) => unmatched.push({ event, reason })
    if (event.stores.length !== 1) reject('multiple_stores')
    else if (day === undefined || store === undefined || key === undefined) reject('no_start_day')
    else {
      const rows = reportIndex.get(key)
      const row = rows === undefined ? undefined : rows[0]
      if (rows === undefined || row === undefined) reject('no_report_row')
      else if (rows.length > 1) reject('ambiguous_report')
      else if (d1Counts.get(key) !== 1) reject('ambiguous_d1')
      else {
        const source = emulatedIndex.get(row.emulatedId)
        if (source === undefined) reject('emulated_missing')
        else if (source.store !== store || source.startDate !== day) reject('emulated_mismatch')
        else matched.push({ event, entry: row, emulated: source, store, startDay: day })
      }
    }
  }
  return { matched, unmatched }
}

// ---------------------------------------------------------------------------------------------
// 直しの計画
// ---------------------------------------------------------------------------------------------

/**
 * イベントごとの結果。
 *  delete=告知か開始の参考 URL がリプライ、店舗がビッカメ娘ではない、または終了が分からないまま止まっている（endUnknown）ので、
 *  イベントごと削除する / blocked=同じだが他のテーブルが参照しているので変更しない / change=終了日か配布数を直す / none=直すところが無い
 */
export type FixOutcome = 'delete' | 'blocked' | 'change' | 'none'

/** 参考 URL の行。kind は posts.jsonl で投稿の種類を引けなかったとき null */
export type ReferenceRow = { type: string; url: string; kind: DetectPostKind | null }

export type FixEventPlan = {
  eventId: string
  emulatedId: string
  title: string
  store: string
  startDay: string
  outcome: FixOutcome
  /** 今の参考 URL の行（変更の有無にかかわらず、マッチした全イベント） */
  references: ReferenceRow[]
  /** 告知・開始の参考 URL でリプライになっている行（delete / blocked の理由） */
  replies: ReferenceRow[]
  /** 店舗がビッカメ娘ではない（delete / blocked の理由）。replies と両方に当たるイベントは「両方」と数える */
  notBiccame: boolean
  /**
   * 終了が分からないまま止まっている（delete / blocked の理由。isEndUnknown）。replies / notBiccame に当たるイベントは
   * そちらを理由にするので false。終了日を推定で入れる（estimated）イベントと、最後の言及が最近の（fresh）イベントは true にならない
   */
  endUnknown: boolean
  /** 終了予定日も終了日も無い。結果: estimated=ended_at を入れる / fresh=最後の言及から STALE_ENDED_DAYS 日未満で null のまま / before_start=開始日より前になるので入れない / has_end=終了の情報がある（削除するイベントも含む） */
  endedState: 'estimated' | 'fresh' | 'before_start' | 'has_end'
  endedAt: { day: string; iso: string } | null
  /** limited_quantity が MAX_LIMITED_QUANTITY を超えている。直す配布条件の行の ID */
  quantity: { from: number; conditionIds: string[] } | null
  /** 消すとき、イベントと一緒に消す子の行数 */
  children: { event_stores: number; event_reference_urls: number; event_conditions: number }
  blockedBy: { table: string; count: number }[]
}

/** acsta の付け替えが要らない・しない行。verdict=keep_ackey（アクキーと一緒の題）/ keep_category（ackey・limited_card・regular_card） */
export type AcstaKept = CategoryRow & { verdict: 'keep_ackey' | 'keep_category' }

export type FixPlan = {
  /** 基準日（JST の暦日）。終了日の推定はここからの日数で決まる */
  today: string
  /** ビッカメ娘ではない店舗キー（characters.json の is_biccame_musume が false） */
  nonBiccameStores: ReadonlySet<string>
  events: FixEventPlan[]
  unmatched: UnmatchedEvent[]
  /** 削除の前に他のテーブルの参照を確かめ直す対象 */
  blockers: ReferencingTable[]
  /** category を other から acsta に付け替える行（確認済みも含む全イベント。削除するイベントは除く） */
  recategorize: CategoryRow[]
  /** 題がアクスタだが付け替えない行（削除するイベントは除く） */
  acstaKept: AcstaKept[]
}

/** 終了予定日も終了日も無いときだけ、最後の言及から終了日を推定する（seed の新規作成と同じ estimateEnded） */
const estimateEndedAt = (
  event: SnapshotEvent,
  emulated: SeedEvent,
  startDay: string,
  today: string
): Pick<FixEventPlan, 'endedState' | 'endedAt'> => {
  if (event.endDate !== null || event.endedAt !== null) return { endedState: 'has_end', endedAt: null }
  const estimate = estimateEnded(emulated.lastSeen, startDay, today)
  const iso = estimate.kind === 'estimated' ? jstDayToUtcIso(estimate.day) : undefined
  return estimate.kind === 'estimated' && iso !== undefined
    ? { endedState: 'estimated', endedAt: { day: estimate.day, iso } }
    : { endedState: estimate.kind === 'estimated' ? 'before_start' : estimate.kind, endedAt: null }
}

const planEvent = (
  { event, emulated, store, startDay }: MatchedEvent,
  context: { posts: ReadonlyMap<string, PostInfo>; nonBiccameStores: ReadonlySet<string>; today: string }
): FixEventPlan => {
  const kindOf = (url: string) => {
    const status = parseStatusUrl(url)
    const post = status === undefined ? undefined : context.posts.get(status.id)
    return post === undefined ? null : post.kind
  }
  const references = event.references.map(({ type, url }): ReferenceRow => ({ type, url, kind: kindOf(url) }))
  // 告知か開始の参考 URL がリプライ（seed の新規作成と同じ isReplyKind）。終了の行は見ない。posts.jsonl に無い投稿は kind が分からないので数えない
  const replies = references.filter(
    (row) => (row.type === 'announce' || row.type === 'start') && row.kind !== null && isReplyKind(row.kind)
  )
  const base = {
    eventId: event.id,
    emulatedId: emulated.id,
    title: event.title,
    store,
    startDay,
    references,
    replies,
    notBiccame: context.nonBiccameStores.has(store),
    children: {
      event_stores: event.stores.length,
      event_reference_urls: event.references.length,
      event_conditions: event.conditions.length
    },
    blockedBy: event.blockedBy
  }
  if (replies.length > 0 || base.notBiccame) {
    const outcome: FixOutcome = event.blockedBy.length > 0 ? 'blocked' : 'delete'
    return { ...base, outcome, endUnknown: false, endedState: 'has_end', endedAt: null, quantity: null }
  }
  // 終了日と配布数は、削除しないイベントにだけ当てる。終了日の推定（B）を先に評価し、入らなかったものだけが終了不明の削除の対象
  const ended = estimateEndedAt(event, emulated, startDay, context.today)
  if (isEndUnknown(ended.endedState, startDay, context.today)) {
    const outcome: FixOutcome = event.blockedBy.length > 0 ? 'blocked' : 'delete'
    return { ...base, outcome, endUnknown: true, endedState: ended.endedState, endedAt: null, quantity: null }
  }
  const quantity =
    event.limitedQuantity !== null && event.limitedQuantity > MAX_LIMITED_QUANTITY
      ? {
          from: event.limitedQuantity,
          conditionIds: event.conditions
            .filter((row) => row.type === 'first_come' && row.quantity !== null && row.quantity > MAX_LIMITED_QUANTITY)
            .map((row) => row.id)
        }
      : null
  return {
    ...base,
    outcome: ended.endedAt !== null || quantity !== null ? 'change' : 'none',
    endUnknown: false,
    endedState: ended.endedState,
    endedAt: ended.endedAt,
    quantity
  }
}

/** 対応が引けたイベントごとに直しを決める。新しい開始日から、同じなら店舗・題の順 */
export const buildFixPlan = (input: {
  matched: readonly MatchedEvent[]
  unmatched: readonly UnmatchedEvent[]
  posts: ReadonlyMap<string, PostInfo>
  /** ビッカメ娘ではない店舗キー（readStoreMarks） */
  nonBiccameStores: ReadonlySet<string>
  today: string
  blockers: readonly ReferencingTable[]
  /** 全イベントの題とカテゴリ（readFixSnapshot の categories）。省略すると acsta の付け替えはしない */
  categories?: readonly CategoryRow[]
}): FixPlan => {
  const events = input.matched
    .map((matched) =>
      planEvent(matched, { posts: input.posts, nonBiccameStores: input.nonBiccameStores, today: input.today })
    )
    .sort((a, b) =>
      chain(
        b.startDay.localeCompare(a.startDay),
        a.store.localeCompare(b.store),
        a.title.localeCompare(b.title),
        a.eventId.localeCompare(b.eventId)
      )
    )
  return {
    today: input.today,
    nonBiccameStores: input.nonBiccameStores,
    events,
    unmatched: [...input.unmatched],
    blockers: input.blockers.filter(({ table }) => !OWNED_TABLES.includes(table)),
    ...planAcsta(
      input.categories === undefined ? [] : input.categories,
      new Set(events.filter((event) => event.outcome === 'delete').map((event) => event.eventId))
    )
  }
}

/** 付け替えの並び: 題、同じなら id */
const byTitle = (a: CategoryRow, b: CategoryRow) => chain(a.title.localeCompare(b.title), a.id.localeCompare(b.id))

/**
 * 題がアクスタの行を、付け替える行（convert）と付け替えない行（keep）に分ける。削除するイベントは両方から除く
 * （消えるイベントの category は直さず、一覧にも出さない）。
 */
export const planAcsta = (rows: readonly CategoryRow[], deleted: ReadonlySet<string>) => {
  const live = rows.filter((row) => !deleted.has(row.id))
  return {
    recategorize: live.filter((row) => judgeAcsta(row.title, row.category) === 'convert').sort(byTitle),
    acstaKept: live
      .flatMap((row): AcstaKept[] => {
        const verdict = judgeAcsta(row.title, row.category)
        return verdict === 'keep_ackey' || verdict === 'keep_category' ? [{ ...row, verdict }] : []
      })
      .sort(byTitle)
  }
}

/** 書き込みを伴うイベント（直す・削除する） */
export const changedEvents = (plan: FixPlan) =>
  plan.events.filter((event) => event.outcome === 'change' || event.outcome === 'delete')

/** 変更の件数（イベントの削除・直しと acsta の付け替え）。0 なら書き込みもバックアップもしない */
export const countChanges = (plan: FixPlan) => changedEvents(plan).length + plan.recategorize.length

// ---------------------------------------------------------------------------------------------
// 書き込み
// ---------------------------------------------------------------------------------------------

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
  /** updated_at に入れる時刻（ISO、Z 付き） */
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
    const stamp = options.now
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
      const unverified = db.query<{ is_verified: number }, [string]>('SELECT is_verified FROM events WHERE id = ?').get(event.eventId)
      if (unverified === null || unverified.is_verified !== 0) throw new Error(`${event.eventId}: not an unverified event`)
      if (event.outcome === 'delete') {
        // 他のテーブルが参照していないことを書く直前にもう一度確かめる
        for (const { table, column } of plan.blockers) {
          const row = db.query<{ n: number }, [string]>(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`).get(event.eventId)
          if (row === null || row.n !== 0) throw new Error(`${event.eventId}: referenced by ${table}`)
        }
        expectChanges(`event_stores of ${event.eventId}`, db.prepare('DELETE FROM event_stores WHERE event_id = ?').run(event.eventId).changes, event.children.event_stores)
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
        expectChanges(`events ${event.eventId}`, (event.endUnknown ? deleteEndless : deleteEvent).run(event.eventId).changes, 1)
        expected.events -= 1
        expected.event_stores -= event.children.event_stores
        expected.event_reference_urls -= event.children.event_reference_urls
        expected.event_conditions -= event.children.event_conditions
        continue
      }
      if (event.endedAt !== null) expectChanges(`ended_at ${event.eventId}`, setEndedAt.run(event.endedAt.iso, stamp, event.eventId).changes, 1)
      if (event.quantity !== null) {
        expectChanges(`limited_quantity ${event.eventId}`, clearQuantity.run(stamp, event.eventId, event.quantity.from).changes, 1)
        for (const conditionId of event.quantity.conditionIds)
          expectChanges(`condition ${conditionId}`, clearCondition.run(stamp, conditionId, event.eventId, MAX_LIMITED_QUANTITY).changes, 1)
      }
    }
    // acsta の付け替え。確認済みの行も対象（削除するイベントは計画から除かれている）。題と category が計画のときのままの行だけを書く
    for (const row of plan.recategorize) {
      if (deletes.has(row.id)) throw new Error(`${row.id}: both deleted and recategorized`)
      expectChanges(`category ${row.id}`, setAcsta.run(stamp, row.id, row.title).changes, 1)
    }
    const after = countRows(db)
    for (const table of TABLES)
      if (after[table] !== expected[table]) throw new Error(`${table}: expected ${expected[table]} rows after fix but found ${after[table]}`)
    if (untouchedFingerprint(db, touched) !== fingerprint) throw new Error('rows outside the fix changed; rolled back')
    return { before, after }
  })
  // 書く側の待ち合わせは IMMEDIATE で先に書き込みロックを取る（途中で他の接続に割り込まれて失敗しない）
  return write.immediate()
}

// ---------------------------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------------------------

export type FixRunOptions = {
  /** .cache/event-detect（emulated-v1.json / posts.jsonl の場所。バックアップもここに書く） */
  dir: string
  /** レポートとバックアップを書ける場所（.cache） */
  cacheRoot: string
  dbPath: string
  /** characters.json。ビッカメ娘ではない店舗（is_biccame_musume が false）の判定に使う */
  charactersPath: string
  apply: boolean
  /** 対応付けに使う、seed --apply が書いたレポート */
  reports: readonly string[]
  /** 直しの計画の出力先（.cache 配下のみ） */
  reportPath: string
  /** 実行時刻（ISO）。基準日（JST）と updated_at に使う */
  now: string
  /** 本番 D1 用の acsta の付け替え SQL の出力先（.cache 配下のみ）。省略すると作らない。--dry-run でも書く（実行はしない） */
  acstaSqlPath?: string
}

/** 本番 D1 用の acsta の付け替え SQL を作った結果と、ローカル D1 との照合 */
export type AcstaSqlRun = {
  path: string
  /** 元データ（gold.json）の取得元と取得時刻・件数 */
  source: string
  fetchedAt: string
  goldEvents: number
  /** SQL の行数（付け替える本番の確認済みイベント） */
  count: number
  /** SQL の行ごとの、ローカル D1 の同じ id の行。無ければ local は null */
  rows: { id: string; title: string; local: { isVerified: boolean; category: string } | null }[]
  /** ローカル D1 にも同じ id の行がある数（確認済み / 確認済みではない）と、無い数 */
  match: { verified: number; unverified: number; absent: number }
  /** ローカル D1 の確認済みの行のうち、題がアクスタ（other か acsta）なのに SQL に無いもの（本番に無い、または本番では別の題・カテゴリ） */
  localVerifiedNotInSql: { id: string; title: string; category: string }[]
}

export type FixRun = {
  plan: FixPlan
  snapshot: { events: number; foreignKeys: number; referencing: ReferencingTable[] }
  counts: RowCounts
  reports: readonly string[]
  reportPath: string
  /** --apply で書いたとき。変更が 0 件なら undefined */
  applied?: { backupPath: string; before: RowCounts; after: RowCounts }
  /** acsta の付け替え SQL を作ったとき */
  acstaSql?: AcstaSqlRun
}

// ---------------------------------------------------------------------------------------------
// 本番 D1 用の SQL
// ---------------------------------------------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 本番の確認済みイベント（gold.json）のうち、acsta の規則（judgeAcsta）に当たるものの UPDATE 文を作る。実行はしない。
 * 1 行 1 件で、WHERE に category = 'other' を入れる（再実行しても変わらない。D1 のリモート実行は BEGIN / COMMIT を受け付けないので書かない）。
 * 先頭のコメントに件数・生成日時・元データを書く。
 */
export const buildAcstaProductionSql = (
  events: readonly { uuid: string; title: string; category: string }[],
  meta: { generatedAt: string; source: string; fetchedAt: string }
) => {
  const rows = events
    .filter((event) => judgeAcsta(event.title, event.category) === 'convert')
    .map(({ uuid, title }) => ({ id: uuid, title }))
    .sort((a, b) => chain(a.title.localeCompare(b.title), a.id.localeCompare(b.id)))
  for (const row of rows) if (!UUID_PATTERN.test(row.id)) throw new Error(`not a uuid: ${row.id}`)
  const text = `${[
    "-- 本番 D1: 題がアクスタ（アクスタ・アクリルスタンド。アクキー・キーホルダーを含まない）で category が other のイベントを acsta にする",
    `-- 件数: ${rows.length}`,
    `-- 生成日時: ${meta.generatedAt}`,
    `-- 元データ: gold.json（${meta.source} の公開 API から ${meta.fetchedAt} に取った確認済みイベント）`,
    "-- 1 行 1 件。WHERE に category = 'other' があるので、再実行しても変わらない（冪等）",
    ...rows.map(
      (row) =>
        `UPDATE events SET category='acsta', updated_at='${meta.generatedAt}' WHERE id='${row.id}' AND category='other';`
    )
  ].join('\n')}\n`
  return { rows, text }
}

/** SQL を書き、ローカル D1 の同じ id の行と照合する */
const writeAcstaSql = async (
  path: string,
  goldPath: string,
  now: string,
  local: readonly CategoryRow[]
): Promise<AcstaSqlRun> => {
  const gold = await readGold(goldPath)
  const { rows, text } = buildAcstaProductionSql(gold.events, {
    generatedAt: now,
    source: gold.source,
    fetchedAt: gold.fetchedAt
  })
  await writeAtomic(path, text)
  const localById = new Map(local.map((row) => [row.id, row] as const))
  const matched = rows.map((row) => {
    const found = localById.get(row.id)
    return { ...row, local: found === undefined ? null : { isVerified: found.isVerified, category: found.category } }
  })
  const sqlIds = new Set(rows.map((row) => row.id))
  return {
    path,
    source: gold.source,
    fetchedAt: gold.fetchedAt,
    goldEvents: gold.events.length,
    count: rows.length,
    rows: matched,
    match: {
      verified: matched.filter((row) => row.local !== null && row.local.isVerified).length,
      unverified: matched.filter((row) => row.local !== null && !row.local.isVerified).length,
      absent: matched.filter((row) => row.local === null).length
    },
    localVerifiedNotInSql: local
      .filter(
        (row) =>
          row.isVerified &&
          !sqlIds.has(row.id) &&
          (row.category === 'other' || row.category === 'acsta') &&
          judgeAcsta(row.title, 'other') === 'convert'
      )
      .map(({ id, title, category }) => ({ id, title, category }))
  }
}

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
    options.acstaSqlPath === undefined ? undefined : assertInside(options.cacheRoot, options.acstaSqlPath, '--acsta-sql')
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
      snapshot: { events: snapshot.events.length, foreignKeys: snapshot.foreignKeys, referencing: snapshot.referencing },
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
      if (backedUp[table] !== counts[table]) throw new Error(`backup ${table}: ${backedUp[table]} rows, expected ${counts[table]}`)
    const { before, after } = applyFix(db, plan, { now: options.now })
    return { ...run, applied: { backupPath, before, after } }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------------------------
// 集計とレポート
// ---------------------------------------------------------------------------------------------

const TYPES: readonly ReferenceType[] = ['announce', 'start', 'end']
const KINDS = ['original', 'reply', 'quote', 'retweet', 'unknown'] as const

const tally = <T extends string>(keys: readonly T[], values: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length]))

const replyTypesOf = (event: FixEventPlan) => [...new Set(event.replies.map((row) => row.type))]

/** 削除する理由。reply=告知か開始の参考 URL がリプライ / store=ビッカメ娘ではない店舗 / both=両方 / end_unknown=終了が分からないまま止まっている */
const deleteReasonOf = (event: FixEventPlan) =>
  event.endUnknown
    ? 'end_unknown'
    : event.replies.length > 0 && event.notBiccame
      ? 'both'
      : event.notBiccame
        ? 'store'
        : 'reply'

/** 開始年ごとのイベントの数 */
const countByStartYear = (events: readonly FixEventPlan[]) =>
  [...new Set(events.map((event) => event.startDay.slice(0, 4)))]
    .sort()
    .map((year) => ({ year, count: events.filter((event) => event.startDay.startsWith(year)).length }))

/** 開始年ごとの、削除するイベントの数 */
export const deletedByStartYear = (plan: FixPlan) =>
  countByStartYear(plan.events.filter((event) => event.outcome === 'delete'))

/** 開始年ごとの、終了が分からないまま止まっていて削除するイベントの数 */
export const endUnknownByStartYear = (plan: FixPlan) =>
  countByStartYear(plan.events.filter((event) => event.outcome === 'delete' && event.endUnknown))

/** 開始日（JST）が基準日から STALE_ENDED_DAYS 日以上前で、終了の情報が無い、対応が引けなかったイベント（最後の言及が分からないので触らない） */
const unmatchedNoEnd = (plan: FixPlan) =>
  plan.unmatched.filter(({ event }) => {
    const day = jstDayOf(event.startDate)
    return event.endDate === null && event.endedAt === null && day !== undefined && isStaleStart(day, plan.today)
  })

/** 直しの集計。ログとレポートの両方に使う */
export const summarizeFix = (plan: FixPlan) => {
  const kindName = (kind: DetectPostKind | null) => (kind === null ? 'unknown' : kind)
  const applied = plan.events.filter((event) => event.outcome === 'change')
  const deleted = plan.events.filter((event) => event.outcome === 'delete')
  const survivors = plan.events.filter((event) => event.outcome === 'change' || event.outcome === 'none')
  const withReplies = deleted.filter((event) => event.replies.length > 0)
  const replyOnly = (type: ReferenceType) =>
    withReplies.filter((event) => replyTypesOf(event).length === 1 && replyTypesOf(event).includes(type)).length
  const storeDeleted = deleted.filter((event) => event.notBiccame)
  const reasons = deleted.map(deleteReasonOf)
  return {
    matched: plan.events.length,
    unmatched: {
      total: plan.unmatched.length,
      byReason: Object.fromEntries(
        [...new Set(plan.unmatched.map(({ reason }) => reason))].map((reason) => [
          reason,
          plan.unmatched.filter((entry) => entry.reason === reason).length
        ])
      )
    },
    outcomes: tally(['delete', 'blocked', 'change', 'none'], plan.events.map((event) => event.outcome)),
    // 対応が引けず触らないイベントのうち、店舗がビッカメ娘ではないもの（確認済みは is_verified=0 の対象に入らない）
    unmatchedNotBiccame: plan.unmatched.filter(({ event }) => event.stores.some((store) => plan.nonBiccameStores.has(store))).length,
    // 削除するイベント。reasons=削除の理由の内訳、replyTypes=リプライが理由のもの（店舗と重なる分を含む）のうち、どちらがリプライだったか、
    // byStore=ビッカメ娘ではない店舗が理由のもの（リプライと重なる分を含む）の店舗別
    deleted: {
      total: deleted.length,
      reasons: {
        replyOnly: reasons.filter((reason) => reason === 'reply').length,
        storeOnly: reasons.filter((reason) => reason === 'store').length,
        both: reasons.filter((reason) => reason === 'both').length,
        endUnknown: reasons.filter((reason) => reason === 'end_unknown').length
      },
      replyTypes: {
        total: withReplies.length,
        announceOnly: replyOnly('announce'),
        startOnly: replyOnly('start'),
        both: withReplies.filter((event) => replyTypesOf(event).length > 1).length
      },
      byStore: [...new Set(storeDeleted.map((event) => event.store))]
        .map((store) => ({ store, count: storeDeleted.filter((event) => event.store === store).length }))
        .sort((a, b) => chain(b.count - a.count, a.store.localeCompare(b.store))),
      // 一緒に消える子の行
      rows: {
        events: deleted.length,
        event_stores: deleted.reduce((sum, event) => sum + event.children.event_stores, 0),
        event_reference_urls: deleted.reduce((sum, event) => sum + event.children.event_reference_urls, 0),
        event_conditions: deleted.reduce((sum, event) => sum + event.children.event_conditions, 0)
      }
    },
    // マッチした全イベントの今の参考 URL の行を、種別×投稿の種類で数える
    currentKinds: Object.fromEntries(
      TYPES.map((type) => [
        type,
        tally(
          KINDS,
          plan.events.flatMap((event) => event.references.filter((row) => row.type === type).map((row) => kindName(row.kind)))
        )
      ])
    ),
    endedAt: {
      estimated: survivors.filter((event) => event.endedState === 'estimated').length,
      fresh: survivors.filter((event) => event.endedState === 'fresh').length,
      beforeStart: survivors.filter((event) => event.endedState === 'before_start').length
    },
    quantity: applied.filter((event) => event.quantity !== null).length,
    // 終了が分からないまま止まっているイベント。deleted=削除 / blocked=参照があるので残す /
    // freshKept=終了の情報が無く開始が古いが、最後の言及が最近のため残す / unmatchedNoEnd=終了の情報が無く開始が古いが、対応が引けず触らない
    endUnknown: {
      deleted: deleted.filter((event) => event.endUnknown).length,
      blocked: plan.events.filter((event) => event.outcome === 'blocked' && event.endUnknown).length,
      freshKept: survivors.filter((event) => event.endedState === 'fresh' && isStaleStart(event.startDay, plan.today)).length,
      unmatchedNoEnd: unmatchedNoEnd(plan).length
    },
    // acsta の付け替え（確認済みも含む）と、題がアクスタだが付け替えない行
    acsta: {
      recategorize: {
        total: plan.recategorize.length,
        verified: plan.recategorize.filter((row) => row.isVerified).length,
        unverified: plan.recategorize.filter((row) => !row.isVerified).length
      },
      kept: {
        total: plan.acstaKept.length,
        keepAckey: plan.acstaKept.filter((row) => row.verdict === 'keep_ackey').length,
        keepCategory: plan.acstaKept.filter((row) => row.verdict === 'keep_category').length
      }
    }
  }
}

/** 開始年ごとの、終了日の推定の結果（入れた / 30 日未満で null のまま / 開始日より前で入れない） */
export const endedByStartYear = (plan: FixPlan) => {
  const rows = plan.events.filter(
    (event) => (event.outcome === 'change' || event.outcome === 'none') && event.endedState !== 'has_end'
  )
  return [...new Set(rows.map((event) => event.startDay.slice(0, 4)))].sort().map((year) => {
    const inYear = rows.filter((event) => event.startDay.startsWith(year))
    return {
      year,
      estimated: inYear.filter((event) => event.endedState === 'estimated').length,
      fresh: inYear.filter((event) => event.endedState === 'fresh').length,
      beforeStart: inYear.filter((event) => event.endedState === 'before_start').length
    }
  })
}

export const fixReport = (options: FixRunOptions, run: FixRun) => ({
  generatedAt: options.now,
  mode: options.apply ? 'apply' : 'dry-run',
  db: options.dbPath,
  reports: run.reports,
  today: run.plan.today,
  staleEndedDays: STALE_ENDED_DAYS,
  nonBiccameStores: [...run.plan.nonBiccameStores].sort(),
  maxLimitedQuantity: MAX_LIMITED_QUANTITY,
  foreignKeys: run.snapshot.foreignKeys,
  referencing: run.snapshot.referencing,
  summary: summarizeFix(run.plan),
  endedByStartYear: endedByStartYear(run.plan),
  deletedByStartYear: deletedByStartYear(run.plan),
  endUnknownByStartYear: endUnknownByStartYear(run.plan),
  unmatchedNoEnd: unmatchedNoEnd(run.plan).map(({ event }) => ({
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    stores: event.stores
  })),
  acsta: {
    recategorize: run.plan.recategorize,
    kept: run.plan.acstaKept
  },
  acstaSql: run.acstaSql === undefined ? null : run.acstaSql,
  unmatched: run.plan.unmatched.map(({ event, reason }) => ({
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    createdAt: event.createdAt,
    stores: event.stores,
    reason
  })),
  events: run.plan.events
    .filter((event) => event.outcome !== 'none')
    .map((event) => ({
      eventId: event.eventId,
      emulatedId: event.emulatedId,
      title: event.title,
      store: event.store,
      startDate: event.startDay,
      outcome: event.outcome,
      deleteReason: event.outcome === 'delete' || event.outcome === 'blocked' ? deleteReasonOf(event) : null,
      replies: event.replies,
      notBiccame: event.notBiccame,
      endedAt: event.endedAt,
      endedState: event.endedState,
      quantity: event.quantity,
      children: event.outcome === 'delete' ? event.children : null,
      blockedBy: event.blockedBy
    }))
})

/** ログに出す削除例の行数の上限。全件はレポート */
const DELETE_EXAMPLES = 10

const total = (counts: RowCounts) => TABLES.map((table) => `${table}=${counts[table]}`).join(' ')

const kindText = (counts: Record<string, number>) => KINDS.map((kind) => `${kind}=${counts[kind]}`).join(' ')

/** 本番 D1 用の SQL のログ */
const describeAcstaSql = (sql: AcstaSqlRun): string[] => [
  '',
  `本番 D1 用の SQL（作っただけで実行しない）: ${sql.path}`,
  `  ${sql.count} 件（元データ gold.json の確認済みイベント ${sql.goldEvents} 件、${sql.source}、取得 ${sql.fetchedAt}）`,
  `  ローカル D1 の同じ id の行: 確認済み ${sql.match.verified} / 確認済みではない ${sql.match.unverified} / 無い ${sql.match.absent}`,
  ...sql.rows.map(
    (row) =>
      `    ${row.id} [${row.title}] ローカル: ${row.local === null ? '無し' : `${row.local.isVerified ? '確認済み' : '自動作成'} category=${row.local.category}`}`
  ),
  `  ローカル D1 の確認済みで題がアクスタ（category が other か acsta）なのに SQL に無い: ${sql.localVerifiedNotInSql.length} 件`,
  ...sql.localVerifiedNotInSql.map((row) => `    ${row.id} [${row.title}] category=${row.category}`)
]

/** 実行結果のログ（標準出力に出す行） */
export const describeFix = (options: FixRunOptions, run: FixRun): string[] => {
  const { plan } = run
  const summary = summarizeFix(plan)
  const eventLabel = (event: { title: string; store: string; startDay: string }) => `${event.store} ${event.startDay} [${event.title}]`
  const deleted = plan.events.filter((event) => event.outcome === 'delete')
  const blocked = plan.events.filter((event) => event.outcome === 'blocked')
  const storeDeleted = deleted.filter((event) => event.notBiccame)
  const quantityEvents = plan.events.filter((event) => event.outcome === 'change' && event.quantity !== null)
  const endUnknownEvents = deleted.filter((event) => event.endUnknown)
  const freshKept = plan.events.filter(
    (event) =>
      (event.outcome === 'change' || event.outcome === 'none') &&
      event.endedState === 'fresh' &&
      isStaleStart(event.startDay, plan.today)
  )
  const owner = (row: CategoryRow) => (row.isVerified ? '確認済み' : '自動作成')
  const rows = summary.deleted.rows
  const reasonText = (event: FixEventPlan) =>
    [
      ...(event.replies.length > 0
        ? [`リプライ: ${event.replies.map((row) => `${row.type}=${row.url} (${row.kind === null ? 'unknown' : row.kind})`).join(' ')}`]
        : []),
      ...(event.notBiccame ? [`店舗: ${event.store}`] : []),
      ...(event.endUnknown ? ['終了が分からない: 終了予定日も終了日も無く、最後の言及が開始日より前'] : [])
    ].join(' / ')
  return [
    `seed --fix: ${options.apply ? '--apply（ローカル D1 に書く）' : '--dry-run（書かない）'} 基準日(JST)=${plan.today} STALE_ENDED_DAYS=${STALE_ENDED_DAYS} MAX_LIMITED_QUANTITY=${MAX_LIMITED_QUANTITY}`,
    `db: ${options.dbPath}`,
    `PRAGMA foreign_keys=${run.snapshot.foreignKeys}（0 なら ON DELETE CASCADE は働かない。子の行は明示的に消す）`,
    `events を参照するテーブル: ${run.snapshot.referencing.map(({ table, column }) => `${table}.${column}`).join(' ')}（子として一緒に消す: ${['event_stores', 'event_reference_urls', 'event_conditions'].join(' ')}。それ以外に参照があれば削除しない）`,
    `対応付けに使ったレポート: ${run.reports.join(' ')}`,
    '',
    `is_verified=0 のイベント: ${run.snapshot.events} 件 = 対応が引けた ${summary.matched} 件 + 引けなかった ${summary.unmatched.total} 件（触らない）`,
    `引けなかった理由: ${summary.unmatched.total === 0 ? '（なし）' : Object.entries(summary.unmatched.byReason).map(([reason, count]) => `${reason}=${count}`).join(' ')}`,
    ...plan.unmatched.map(({ event, reason }) => `  ${event.stores.join(',')} ${event.startDate} [${event.title}] created_at=${event.createdAt} ${reason}`),
    '',
    `イベントごとの結果: ${Object.entries(summary.outcomes).map(([outcome, count]) => `${outcome}=${count}`).join(' ')}`,
    '',
    '参考 URL の行は UPDATE / DELETE / INSERT しない（リプライの告知・開始と、ビッカメ娘ではない店舗はイベントごと削除する。終了の行は変えない）',
    `今の参考 URL の行の投稿の種類（対応が引けた全イベント）: announce[${kindText(summary.currentKinds.announce)}] start[${kindText(summary.currentKinds.start)}] end[${kindText(summary.currentKinds.end)}]`,
    '',
    `削除する自動作成分（is_verified=0）: ${deleted.length} 件 = リプライだけ ${summary.deleted.reasons.replyOnly} + 店舗だけ ${summary.deleted.reasons.storeOnly} + 両方 ${summary.deleted.reasons.both} + 終了が分からない ${summary.deleted.reasons.endUnknown}（リプライ = 告知か開始の参考 URL がリプライ / 店舗 = ビッカメ娘ではない店舗 / 終了が分からない = 下記）`,
    `  リプライが理由（店舗と重なる分を含む）: ${summary.deleted.replyTypes.total} 件 = 告知だけ ${summary.deleted.replyTypes.announceOnly} + 開始だけ ${summary.deleted.replyTypes.startOnly} + 両方 ${summary.deleted.replyTypes.both}`,
    `  店舗が理由（リプライと重なる分を含む）: ${summary.deleted.byStore.reduce((sum, entry) => sum + entry.count, 0)} 件 = ${summary.deleted.byStore.map((entry) => `${entry.store}×${entry.count}`).join(' ')}（ビッカメ娘ではない店舗: ${[...plan.nonBiccameStores].sort().join(' ')}）`,
    `  一緒に消える行: events=${rows.events} event_stores=${rows.event_stores} event_reference_urls=${rows.event_reference_urls} event_conditions=${rows.event_conditions}`,
    `  開始年別: ${deletedByStartYear(plan).map((row) => `${row.year}=${row.count}`).join(' ')}`,
    `  例（先頭 ${Math.min(DELETE_EXAMPLES, deleted.length)} 件。全件はレポート）:`,
    ...deleted.slice(0, DELETE_EXAMPLES).map((event) => `    ${eventLabel(event)} ${reasonText(event)}`),
    `  店舗が理由の例（先頭 ${Math.min(DELETE_EXAMPLES, storeDeleted.length)} 件）:`,
    ...storeDeleted.slice(0, DELETE_EXAMPLES).map((event) => `    ${eventLabel(event)} ${reasonText(event)}`),
    `終了が分からないまま止まっているため削除（終了予定日も終了日も無く、最後の言及が開始日より前で終了日を推定できず、開始が基準日の ${STALE_ENDED_DAYS} 日以上前。ended_at の推定を先に評価して入らなかったもの。削除の合計に含む）: ${summary.endUnknown.deleted} 件`,
    `  開始年別: ${endUnknownByStartYear(plan).map((row) => `${row.year}=${row.count}`).join(' ')}`,
    `  例（先頭 ${Math.min(DELETE_EXAMPLES, endUnknownEvents.length)} 件。全件はレポート）:`,
    ...endUnknownEvents.slice(0, DELETE_EXAMPLES).map((event) => `    ${eventLabel(event)}`),
    `  残す（終了の情報が無く開始が ${STALE_ENDED_DAYS} 日以上前だが、最後の言及が ${STALE_ENDED_DAYS} 日以内で今も配布中かもしれない）: ${freshKept.length} 件`,
    ...freshKept.map((event) => `    ${eventLabel(event)}`),
    `  触らない（対応が引けず最後の言及が分からない。終了の情報が無く開始が ${STALE_ENDED_DAYS} 日以上前）: ${summary.endUnknown.unmatchedNoEnd} 件`,
    ...unmatchedNoEnd(plan).map(({ event }) => `    ${event.stores.join(',')} ${event.startDate} [${event.title}]`),
    `削除の理由に当たるが、他のテーブルが参照しているので削除しない（変更しない）: ${blocked.length} 件`,
    ...blocked.map((event) => `  ${eventLabel(event)} ${event.blockedBy.map(({ table, count }) => `${table}=${count}`).join(' ')}`),
    `対応が引けず触らないイベントのうち、店舗がビッカメ娘ではないもの: ${summary.unmatchedNotBiccame} 件`,
    '',
    `ended_at（終了予定日も終了日も無いイベント。削除するイベントと削除できないイベントを除く）: 推定で入れる ${summary.endedAt.estimated} 件 / 最後の言及から ${STALE_ENDED_DAYS} 日未満で null のまま ${summary.endedAt.fresh} 件 / 開始日より前になるので入れない ${summary.endedAt.beforeStart} 件`,
    '  開始年別（入れる / 30 日未満で null のまま / 開始日より前）:',
    ...endedByStartYear(plan).map((row) => `    ${row.year}: ${row.estimated} / ${row.fresh} / ${row.beforeStart}`),
    '',
    `配布数が ${MAX_LIMITED_QUANTITY} を超えるので limited_quantity を消し、配布条件を everyone にする（削除しないイベントのみ）: ${quantityEvents.length} 件`,
    ...quantityEvents.map((event) => `  ${eventLabel(event)} limited_quantity=${event.quantity === null ? '' : event.quantity.from}`),
    '',
    `acsta に付け替える（題がアクスタ・アクリルスタンドで、アクキー・キーホルダーを含まない other。確認済みも対象。削除するイベントは除く）: ${plan.recategorize.length} 件 = 確認済み ${summary.acsta.recategorize.verified} + 自動作成 ${summary.acsta.recategorize.unverified}`,
    ...plan.recategorize.map((row) => `  ${owner(row)} ${row.id} [${row.title}]`),
    `題がアクスタだが付け替えない: ${plan.acstaKept.length} 件 = アクキーを含む題 ${summary.acsta.kept.keepAckey} + ackey・limited_card・regular_card ${summary.acsta.kept.keepCategory}`,
    ...plan.acstaKept.map((row) => `  ${owner(row)} ${row.id} [${row.title}] category=${row.category}（${row.verdict === 'keep_ackey' ? 'アクキーを含む題' : 'category が other ではない'}）`),
    ...(run.acstaSql ? describeAcstaSql(run.acstaSql) : []),
    '',
    `ローカル D1 の件数（書く前）: ${total(run.counts)}`,
    ...(run.applied
      ? [
          `バックアップ: ${run.applied.backupPath}`,
          `書き込み後: ${total(run.applied.after)}`,
          `増減: ${TABLES.map((table) => `${table}=${run.applied ? run.applied.after[table] - run.applied.before[table] : 0}`).join(' ')}`
        ]
      : [options.apply ? '変更が 0 件のため、書き込みもバックアップもしていない' : '書き込みなし（--apply で書く）']),
    `レポート: ${run.reportPath}`
  ]
}
