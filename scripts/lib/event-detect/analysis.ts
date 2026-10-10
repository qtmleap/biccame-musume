import {
  buildRescueTerms,
  classifyPost,
  DROP_REASONS,
  type DropReason,
  dedupKey,
  EXCLUDE_KEYWORDS,
  type ExcludeHit,
  KEYWORDS,
  type KeywordHit,
  matchExcludes,
  matchKeywords,
  normalizeText,
  RESCUE_KEYWORDS
} from '@biccame/shared/event-detect/filter'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { dayjs } from '../../../workers/bot/src/timeline/utils/dayjs'
import { buildGoldIndex, type GoldEvent, type GoldRef, parseStatusUrl, type ReferenceType, snowflakeTime } from './gold'
import type { EmulatedRecord } from './store'

// 投稿・正解イベント・店舗アカウントから、ビューワとレポートが使う判定結果を組み立てる。

export type StoreAccount = { storeId: string; name: string; screenName: string }

export type PostRow = {
  post: DetectPost
  /** 投稿日時（epoch ミリ秒） */
  time: number
  /** normalizeText 済みの本文。検索とキーワード集計で使い回す */
  normalized: string
  /** 無効化を無視して当たる語。キーワードの寄与を測るのに使う */
  allKeywords: Set<string>
  /** 無効化を無視して当たる除外語 */
  allExcludes: Set<string>
  reason: DropReason | undefined
  hits: KeywordHit[]
  excludeHits: ExcludeHit[]
  rescueHits: string[]
  /** キーワードを通過した時点の強シグナル。除外語で落ちた投稿でも true になりうる */
  strong: boolean
  gold: GoldRef[]
  /** 同じ文面の投稿群。代表 ID と件数 */
  cluster: { id: string; size: number }
  /** 投稿日時が開催期間（前後の猶予込み）に入る、その店舗の D1 イベント */
  nearbyEvents: string[]
}

export type Analysis = {
  rows: PostRow[]
  rowById: Map<string, PostRow>
  events: GoldEvent[]
  eventById: Map<string, GoldEvent>
  /** 店舗キー → その店舗のイベントを投稿するアカウント（小文字） */
  storeAccounts: Map<string, Set<string>>
  /** アカウント（小文字） → 担当店舗キー */
  accountStores: Map<string, Set<string>>
  goldIndex: Map<string, GoldRef[]>
  /** アカウント（小文字） → 通過した投稿 */
  passedByAccount: Map<string, PostRow[]>
  disabled: Set<string>
  disabledExcludes: Set<string>
  /** 救済語の一覧（buildRescueTerms の結果）。救済語ごとの寄与を測るのに使う */
  rescueTerms: string[]
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

const valuesOf = <K, V>(map: Map<K, Iterable<V>>, key: K): V[] => {
  const value = map.get(key)
  return value ? [...value] : []
}

const DAY = 86_400_000
// 告知は開始の 1〜1.5 か月前に出ることがあり、終了報告は終了予定日の数日後になることがある。
const ANNOUNCE_LEAD = 45 * DAY
const END_GRACE = 7 * DAY
// 終了日の無いイベント（通年名刺・無くなり次第終了のアクキー等）は数か月配り続けることがある。
// 熊本の夏名刺は開始から 99 日後に配布終了の報告があった。
const OPEN_ENDED = 120 * DAY

export const eventWindow = (event: GoldEvent): { from: number; until: number } => {
  const start = Date.parse(event.startDate)
  const ends = [event.endDate, event.endedAt].filter((value): value is string => value !== undefined).map(Date.parse)
  const until = ends.length === 0 ? start + OPEN_ENDED : Math.max(start, ...ends) + END_GRACE
  return { from: start - ANNOUNCE_LEAD, until }
}

/**
 * 店舗とアカウントの対応。characters.json の店舗アカウントに加え、正解データで
 * 他店舗のイベントに使われたアカウントも含める（京王調布店がせいせきたんを告知する等）。
 */
export const buildAccountMaps = (
  accounts: readonly StoreAccount[],
  goldIndex: Map<string, GoldRef[]>,
  events: readonly GoldEvent[]
) => {
  const eventById = new Map(events.map((event) => [event.uuid, event]))
  const accountStores = new Map<string, Set<string>>()
  const add = (account: string, store: string) => {
    const key = account.toLowerCase()
    const stores = accountStores.get(key)
    if (stores) stores.add(store)
    else accountStores.set(key, new Set([store]))
  }
  for (const account of accounts) add(account.screenName, account.storeId)
  for (const refs of goldIndex.values()) {
    for (const ref of refs) {
      const event = eventById.get(ref.eventId)
      if (event) for (const store of event.stores) add(ref.screenName, store)
    }
  }
  const storeAccounts = new Map<string, Set<string>>()
  for (const [account, stores] of accountStores) {
    for (const store of stores) {
      const set = storeAccounts.get(store)
      if (set) set.add(account)
      else storeAccounts.set(store, new Set([account]))
    }
  }
  return { accountStores, storeAccounts }
}

export const analyze = (input: {
  posts: readonly DetectPost[]
  events: readonly GoldEvent[]
  accounts: readonly StoreAccount[]
  /** 救済語に使うキャラクター名（characters.json の character.name） */
  characterNames: readonly string[]
  disabled?: Iterable<string>
  disabledExcludes?: Iterable<string>
}): Analysis => {
  const disabled = new Set(input.disabled)
  const disabledExcludes = new Set(input.disabledExcludes)
  const rescueTerms = buildRescueTerms(input.characterNames)
  const events = [...input.events]
  const eventById = new Map(events.map((event) => [event.uuid, event]))
  const goldIndex = buildGoldIndex(events)
  const { accountStores, storeAccounts } = buildAccountMaps(input.accounts, goldIndex, events)
  const storeAccountSet = new Set(input.accounts.map((account) => account.screenName.toLowerCase()))

  // 店舗ごとのイベント期間。投稿ごとに全イベントを舐めないよう先に引いておく。
  const windowsByStore = new Map<string, { id: string; from: number; until: number }[]>()
  for (const event of events) {
    const window = eventWindow(event)
    for (const store of event.stores) push(windowsByStore, store, { id: event.uuid, ...window })
  }

  const clusters = new Map<string, string[]>()
  const rows: PostRow[] = input.posts.map((post) => {
    const verdict = classifyPost(post, { storeAccounts: storeAccountSet, rescueTerms, disabled, disabledExcludes })
    const time = Date.parse(post.createdAt)
    const nearbyEvents = valuesOf(accountStores, post.screenName.toLowerCase()).flatMap((store) =>
      valuesOf(windowsByStore, store)
        .filter((window) => window.from <= time && time <= window.until)
        .map((window) => window.id)
    )
    push(clusters, dedupKey(post.text), post.id)
    const gold = goldIndex.get(post.id)
    const normalized = normalizeText(post.text)
    return {
      post,
      time,
      normalized,
      allKeywords: new Set(matchKeywords(normalized).map((hit) => hit.keyword)),
      allExcludes: new Set(matchExcludes(normalized).map((hit) => hit.keyword)),
      ...verdict,
      gold: gold ? gold : [],
      cluster: { id: post.id, size: 1 },
      nearbyEvents: [...new Set(nearbyEvents)]
    }
  })
  const rowById = new Map(rows.map((row) => [row.post.id, row]))
  for (const members of clusters.values()) {
    for (const id of members) {
      const row = rowById.get(id)
      if (row) row.cluster = { id: members[0], size: members.length }
    }
  }
  const passedByAccount = new Map<string, PostRow[]>()
  for (const row of rows) if (row.reason === undefined) push(passedByAccount, row.post.screenName.toLowerCase(), row)
  return {
    rows,
    rowById,
    events,
    eventById,
    storeAccounts,
    accountStores,
    goldIndex,
    passedByAccount,
    disabled,
    disabledExcludes,
    rescueTerms
  }
}

const REFERENCE_TYPES: readonly ReferenceType[] = ['announce', 'start', 'end']

export type FilterStage = {
  key: string
  label: string
  posts: number
  gold: number
  goldByType: Record<ReferenceType, number>
}

const countGold = (rows: readonly PostRow[]) => {
  const goldRows = rows.filter((row) => row.gold.length > 0)
  const goldByType = Object.fromEntries(
    REFERENCE_TYPES.map((type) => [type, goldRows.filter((row) => row.gold.some((ref) => ref.type === type)).length])
  )
  return {
    gold: goldRows.length,
    goldByType: { announce: goldByType.announce, start: goldByType.start, end: goldByType.end }
  }
}

/**
 * 段階ごとの残存件数。各段階はそれまでの除外理由をすべて適用した後の件数。
 */
export const filterStages = (analysis: Analysis): FilterStage[] => {
  const labels: Record<DropReason, string> = {
    retweet: 'リツイートを除外',
    reply_to_other: '他アカウント宛てリプライを除外',
    non_store_account: '店舗アカウント以外を除外',
    no_keyword: 'キーワードを含まないものを除外',
    excluded_keyword: '除外語を含むもの（救済語なし）を除外'
  }
  const stages: FilterStage[] = [
    { key: 'all', label: '全件', posts: analysis.rows.length, ...countGold(analysis.rows) }
  ]
  for (const [index, reason] of DROP_REASONS.entries()) {
    const applied = new Set(DROP_REASONS.slice(0, index + 1))
    const rows = analysis.rows.filter((row) => row.reason === undefined || !applied.has(row.reason))
    stages.push({ key: reason, label: labels[reason], posts: rows.length, ...countGold(rows) })
  }
  const passed = analysis.rows.filter((row) => row.reason === undefined)
  // 同じ文面は 1 回の判定で済むので件数はまとめた後の数。まとめても正例の本文は判定対象に
  // 残るため、正例の数は通過した全件で数える。
  const unique = new Set(passed.map((row) => row.cluster.id))
  stages.push({ key: 'unique', label: '同一文面をまとめた件数', posts: unique.size, ...countGold(passed) })
  const strong = passed.filter((row) => row.strong)
  stages.push({
    key: 'strong',
    label: '強シグナル（景品＋配布方法＋日付）',
    posts: strong.length,
    ...countGold(strong)
  })
  return stages
}

/**
 * 正解データの投稿 ID のうちアーカイブに含まれないもの。アーカイブ期間外か、リスト外のアカウント。
 */
export const missingGold = (analysis: Analysis, range: { from: number; until: number }) =>
  [...analysis.goldIndex.entries()]
    .filter(([id]) => !analysis.rowById.has(id))
    .map(([id, refs]) => ({ id, refs, inRange: inRange(id, range) }))

const inRange = (id: string, range: { from: number; until: number }) => {
  const time = snowflakeTime(id)
  return range.from <= time && time < range.until
}

export type StatCounts = {
  /** アーカイブの投稿数 */
  posts: number
  /** 機械フィルタを通過した投稿。LLM・Clef の判定前なので「候補」 */
  candidates: number
  /** 参考 URL が D1 イベントに使われている投稿 */
  goldPosts: number
  /** D1 イベント数 */
  events: number
}

/**
 * 判定キャッシュ（.cache/event-detect/ の judge・extract・clef）から読んだ、投稿 ID → イベントである確率（0〜1）。
 * 判定していない投稿は載らない。llm は Claude Haiku 5.5、clef は精度評価（eval）のサンプルだけ。
 */
export type Judgements = { llm: Map<string, number>; clef: Map<string, number> }

/**
 * 判定の確率がこの値以上なら「イベントと判定した」と数える。eval の is_event（evaluate.ts）と
 * emulate の isEvent（emulate.ts）の既定のしきい値と同じ。ちょうどこの値のときも含む。
 */
export const EVENT_PROBABILITY_THRESHOLD = 0.5

/** 年別の判定の件数。どれもイベント候補（reason が無い投稿）だけを数える */
type JudgementCounts = {
  /** LLM（Claude Haiku 5.5）が確率 EVENT_PROBABILITY_THRESHOLD 以上と判定した候補の数 */
  llm: number
  /** LLM の判定がある候補の数（確率の大小によらない） */
  llmJudged: number
  /** Clef が確率 EVENT_PROBABILITY_THRESHOLD 以上と判定した候補の数 */
  clef: number
  /** Clef の判定がある候補の数。eval のサンプルだけなので候補の一部 */
  clefJudged: number
}

/**
 * emulate コマンドが作ったイベントのうち、集計に使う項目。startDate・endDate・endedAt は YYYY-MM-DD、
 * endDate は告知に書かれた終了予定日、endedAt は終了報告の投稿の日、
 * firstSeen は最初の言及の投稿時刻（epoch ミリ秒）。
 */
export type EmulatedEntry = { store: string; startDate?: string; endDate?: string; endedAt?: string; firstSeen: number }

/**
 * emulate の結果ファイルを読んだもの。emulatedAt はファイルの更新時刻（ISO）。
 * events は統計に使う EmulatedEntry の項目に加え、LLM イベントの一覧・詳細に使う項目（言及など）も持つ。
 */
export type EmulatedFile = { events: readonly EmulatedRecord[]; emulatedAt: string }

/** emulate が作ったイベントの件数。年別とアカウント別で同じ数え方をする */
type EmulatedCounts = {
  /** emulate が作ったイベントの数。開始を見ていないもの（startUnknown）も含む */
  emulated: number
  /** そのうち終了まで追えた数。終了報告（endedAt）か告知の終了予定日（endDate）のどちらかがあれば数える。予定日が未来でも数える */
  emulatedEnded: number
}

export type YearStat = StatCounts & JudgementCounts & EmulatedCounts & { year: number }

/** 全投稿の最古・最新の投稿日時（ISO）。投稿が 0 件なら null */
export type PostRange = { oldest: string | null; newest: string | null }

export type AccountStat = StatCounts &
  EmulatedCounts & {
    screenName: string
    /** characters.json でこのアカウントに対応する店舗キー。店舗に対応しないアカウントは null */
    store: string | null
  }

const JST_OFFSET = 9 * 3_600_000

/**
 * 投稿時刻（epoch ミリ秒）から JST の暦年を引く関数。dayjs の tz は 1 回 30µs ほどかかり、124 万行では
 * 40 秒になるので、JST の日ごとに結果を使い回す。JST は夏時間が無く UTC+9 固定なので、日の切れ目は
 * 9 時間のずらしで決まる。
 */
const jstYearOf = () => {
  const byDay = new Map<number, number>()
  return (time: number): number => {
    const day = Math.floor((time + JST_OFFSET) / DAY)
    const cached = byDay.get(day)
    if (cached !== undefined) return cached
    const year = dayjs(time).year()
    byDay.set(day, year)
    return year
  }
}

/**
 * emulate が作ったイベントの年を引く関数。startDate（YYYY-MM-DD の暦日をそのまま JST の日付として読む）の年で、
 * 無ければ firstSeen の JST 年。年別の統計（postStats）と LLM イベントの一覧で、同じ割り当てを使うための共通の定義。
 */
export const emulatedYearOf = (): ((entry: EmulatedEntry) => number) => {
  const yearOf = jstYearOf()
  return (entry) => (entry.startDate === undefined ? yearOf(entry.firstSeen) : Number(entry.startDate.slice(0, 4)))
}

/** 終了の日（YYYY-MM-DD）。終了報告（endedAt）があればその日、無ければ告知の終了予定日（endDate）。どちらも無ければ undefined */
export const emulatedEndedDay = (entry: EmulatedEntry): string | undefined =>
  entry.endedAt === undefined ? entry.endDate : entry.endedAt

/** 終了まで追えたか。終了報告（endedAt）か告知の終了予定日（endDate）があれば true（予定日が未来でも true） */
export const isEmulatedEnded = (entry: EmulatedEntry): boolean => emulatedEndedDay(entry) !== undefined

const emptyCounts = (): StatCounts => ({ posts: 0, candidates: 0, goldPosts: 0, events: 0 })

const emptyEmulatedCounts = (): EmulatedCounts => ({ emulated: 0, emulatedEnded: 0 })

const emptyYearCounts = (): StatCounts & JudgementCounts & EmulatedCounts => ({
  ...emptyCounts(),
  llm: 0,
  llmJudged: 0,
  clef: 0,
  clefJudged: 0,
  ...emptyEmulatedCounts()
})

/** emulate が作ったイベント 1 件を数える。終了報告（endedAt）か終了予定日（endDate）があれば、終了にも 1 回だけ数える */
const countEmulated = (counts: EmulatedCounts, entry: EmulatedEntry) => {
  counts.emulated += 1
  if (isEmulatedEnded(entry)) counts.emulatedEnded += 1
}

const countRow = (counts: StatCounts, row: PostRow) => {
  counts.posts += 1
  if (row.reason === undefined) counts.candidates += 1
  if (row.gold.length > 0) counts.goldPosts += 1
}

/** イベント候補 1 件の判定を数える。判定が無ければ何も足さない */
const countJudgements = (counts: JudgementCounts, id: string, judgements: Judgements) => {
  const llm = judgements.llm.get(id)
  if (llm !== undefined) {
    counts.llmJudged += 1
    if (llm >= EVENT_PROBABILITY_THRESHOLD) counts.llm += 1
  }
  const clef = judgements.clef.get(id)
  if (clef !== undefined) {
    counts.clefJudged += 1
    if (clef >= EVENT_PROBABILITY_THRESHOLD) counts.clef += 1
  }
}

/**
 * 年別（JST）とアカウント別の件数。全行を 1 回だけ走査する。events は年別が開始日の年、アカウント別が
 * characters.json でそのアカウントに対応する 1 店舗のイベント。analysis.accountStores は正解データで他店舗の
 * イベントに使われたアカウントも含み、アカウントと店舗が一対一にならないので、ここでは使わない。
 * judgements を渡すと、年別にイベント候補の LLM・Clef の判定を数える（アカウント別には持たない）。渡さなければ 0。
 * emulated（emulate が作ったイベント）を渡すと、年別とアカウント別に作ったイベントと終了まで追えた数を数える。
 * 年は startDate（YYYY-MM-DD の暦日をそのまま JST の日付として読む）の年で、無ければ firstSeen の JST 年。
 * アカウント別は、アカウントの店舗（store）のイベントで数え、store が null のアカウントは 0。渡さなければ 0。
 * range は、同じ走査で選んだ全投稿の最古・最新（アカウントごとの値から選び直さない）。
 */
export const postStats = (
  analysis: Analysis,
  accounts: readonly StoreAccount[],
  judgements: Judgements = { llm: new Map(), clef: new Map() },
  emulated: readonly EmulatedEntry[] = []
): { years: YearStat[]; accounts: AccountStat[]; range: PostRange } => {
  const yearOf = jstYearOf()
  const emulatedYear = emulatedYearOf()
  const storeOfAccount = new Map(accounts.map((account) => [account.screenName.toLowerCase(), account.storeId]))
  const byYear = new Map<number, StatCounts & JudgementCounts & EmulatedCounts>()
  const byAccount = new Map<string, { screenName: string; counts: StatCounts }>()
  const emulatedByStore = new Map<string, EmulatedCounts>()
  const bounds: { oldest: PostRow | null; newest: PostRow | null } = { oldest: null, newest: null }
  const yearCounts = (year: number): StatCounts & JudgementCounts & EmulatedCounts => {
    const found = byYear.get(year)
    if (found) return found
    const created = emptyYearCounts()
    byYear.set(year, created)
    return created
  }
  const storeEmulatedCounts = (store: string): EmulatedCounts => {
    const found = emulatedByStore.get(store)
    if (found) return found
    const created = emptyEmulatedCounts()
    emulatedByStore.set(store, created)
    return created
  }
  for (const row of analysis.rows) {
    const counts = yearCounts(yearOf(row.time))
    countRow(counts, row)
    if (row.reason === undefined) countJudgements(counts, row.post.id, judgements)
    if (bounds.oldest === null || row.time < bounds.oldest.time) bounds.oldest = row
    if (bounds.newest === null || row.time > bounds.newest.time) bounds.newest = row
    const key = row.post.screenName.toLowerCase()
    const entry = byAccount.get(key)
    if (entry) {
      countRow(entry.counts, row)
    } else {
      const counts = emptyCounts()
      countRow(counts, row)
      byAccount.set(key, { screenName: row.post.screenName, counts })
    }
  }
  // 投稿の無い年でも、イベントがあれば行に含める
  for (const event of analysis.events) yearCounts(yearOf(Date.parse(event.startDate))).events += 1
  for (const entry of emulated) {
    countEmulated(yearCounts(emulatedYear(entry)), entry)
    countEmulated(storeEmulatedCounts(entry.store), entry)
  }

  const years = [...byYear.entries()].sort(([a], [b]) => a - b).map(([year, counts]) => ({ year, ...counts }))
  const accountStats = [...byAccount.entries()]
    .sort(([keyA, a], [keyB, b]) => {
      const diff = b.counts.posts - a.counts.posts
      if (diff !== 0) return diff
      return keyA < keyB ? -1 : 1
    })
    .map(([key, entry]) => {
      const found = storeOfAccount.get(key)
      const store = found === undefined ? null : found
      const emulatedCounts = store === null ? undefined : emulatedByStore.get(store)
      return {
        screenName: entry.screenName,
        store,
        ...entry.counts,
        events: store === null ? 0 : analysis.events.filter((event) => event.stores.includes(store)).length,
        ...(emulatedCounts === undefined ? emptyEmulatedCounts() : emulatedCounts)
      }
    })
  return {
    years,
    accounts: accountStats,
    range: {
      oldest: bounds.oldest === null ? null : bounds.oldest.post.createdAt,
      newest: bounds.newest === null ? null : bounds.newest.post.createdAt
    }
  }
}

export type KeywordStat = {
  keyword: string
  group: KeywordHit['group']
  disabled: boolean
  posts: number
  gold: number
  /** この語でしか拾えていない件数（他の語を全部残したまま、この語だけ外すと落ちる件数） */
  onlyPosts: number
  onlyGold: number
}

/** 構造（RT・他者宛てリプライ・店舗外）で落ちていない投稿 */
const structurallyPassed = (row: PostRow) =>
  row.reason === undefined || row.reason === 'no_keyword' || row.reason === 'excluded_keyword'

/**
 * キーワードごとの寄与。構造で落ちた投稿は数えない。
 */
export const keywordStats = (analysis: Analysis): KeywordStat[] => {
  const candidates = analysis.rows.filter(structurallyPassed)
  return KEYWORDS.map(({ keyword, group }) => {
    const matched = candidates.filter((row) => row.allKeywords.has(keyword))
    const only = matched.filter((row) =>
      [...row.allKeywords].every((other) => other === keyword || analysis.disabled.has(other))
    )
    return {
      keyword,
      group,
      disabled: analysis.disabled.has(keyword),
      posts: matched.length,
      gold: matched.filter((row) => row.gold.length > 0).length,
      onlyPosts: only.length,
      onlyGold: only.filter((row) => row.gold.length > 0).length
    }
  })
}

export type ExcludeStat = {
  keyword: string
  group: ExcludeHit['group']
  disabled: boolean
  /** キーワードを通過し、この語を含み、救済語を含まない投稿（＝この語で除外されうる） */
  posts: number
  /** この語を含む正解。救済語で守られたものも含む */
  gold: number
  /** この語を含むが救済語で残った正解 */
  rescuedGold: number
  /** 他の除外語を含まず、この語だけで除外されている投稿（外すと通過に戻る） */
  onlyPosts: number
  /** posts のうち正解（救済語なしで落ちる正解。0 であるべき） */
  droppedGold: number
}

/**
 * 除外語ごとの寄与。キーワードを通過した投稿（通過・除外語で除外）だけを数える。
 */
export const excludeStats = (analysis: Analysis): ExcludeStat[] => {
  const candidates = analysis.rows.filter((row) => row.reason === undefined || row.reason === 'excluded_keyword')
  return EXCLUDE_KEYWORDS.map(({ keyword, group }) => {
    const matched = candidates.filter((row) => row.allExcludes.has(keyword))
    const unrescued = matched.filter((row) => row.rescueHits.length === 0)
    const only = unrescued.filter((row) =>
      [...row.allExcludes].every((other) => other === keyword || analysis.disabledExcludes.has(other))
    )
    return {
      keyword,
      group,
      disabled: analysis.disabledExcludes.has(keyword),
      posts: unrescued.length,
      gold: matched.filter((row) => row.gold.length > 0).length,
      rescuedGold: matched.filter((row) => row.gold.length > 0 && row.rescueHits.length > 0).length,
      onlyPosts: only.length,
      droppedGold: unrescued.filter((row) => row.gold.length > 0).length
    }
  })
}

export type RescueStat = {
  keyword: string
  /** RESCUE_KEYWORDS の固定の語なら keyword、キャラクター名（○○たん）由来なら character */
  kind: 'keyword' | 'character'
  /** 通過した投稿のうち、除外語に当たり、この語を含む件数（この語が守っている投稿） */
  posts: number
  /** posts のうち、当たった救済語がこの語だけの件数（この語が無ければ除外される） */
  onlyPosts: number
  /** posts のうち正解 */
  gold: number
}

/**
 * 救済語ごとの寄与。通過した投稿のうち除外語に当たったものだけを数える（救済語が無ければ
 * 除外されていたはずの投稿）。除外語の無効化は excludeHits に反映済みなので、そのまま追従する。
 * 並びは救済した投稿の降順、同数は語の昇順。
 */
export const rescueStats = (analysis: Analysis): RescueStat[] => {
  const fixed = new Set<string>(RESCUE_KEYWORDS)
  const stats = new Map<string, RescueStat>(
    analysis.rescueTerms.map((keyword) => [
      keyword,
      { keyword, kind: fixed.has(keyword) ? 'keyword' : 'character', posts: 0, onlyPosts: 0, gold: 0 }
    ])
  )
  for (const row of analysis.rows) {
    if (row.reason !== undefined || row.excludeHits.length === 0) continue
    for (const term of row.rescueHits) {
      const stat = stats.get(term)
      if (!stat) continue
      stat.posts += 1
      if (row.rescueHits.length === 1) stat.onlyPosts += 1
      if (row.gold.length > 0) stat.gold += 1
    }
  }
  return [...stats.values()].sort((a, b) => {
    const diff = b.posts - a.posts
    if (diff !== 0) return diff
    return a.keyword < b.keyword ? -1 : 1
  })
}

export type CoverageGap = {
  account: string
  stores: string[]
  posts: PostRow[]
}

/**
 * 登録漏れ候補。強シグナルの投稿のうち、その店舗の D1 イベント期間のどれにも入らないもの。
 * 文面が同じ投稿はまとめ、アカウントごとに返す。
 */
export const coverageGaps = (analysis: Analysis): CoverageGap[] => {
  const byAccount = new Map<string, PostRow[]>()
  for (const row of analysis.rows) {
    if (row.reason !== undefined || !row.strong || row.gold.length > 0 || row.nearbyEvents.length > 0) continue
    if (row.cluster.id !== row.post.id && analysis.rowById.get(row.cluster.id)?.strong) continue
    push(byAccount, row.post.screenName.toLowerCase(), row)
  }
  return [...byAccount.entries()]
    .map(([account, posts]) => ({
      account,
      stores: valuesOf(analysis.accountStores, account),
      posts: posts.sort((a, b) => a.post.createdAt.localeCompare(b.post.createdAt))
    }))
    .sort((a, b) => b.posts.length - a.posts.length)
}

/**
 * イベントに関係しそうな投稿。担当アカウントの、期間内の通過投稿と正例投稿。
 */
export const relatedPosts = (analysis: Analysis, eventId: string): PostRow[] => {
  const event = analysis.eventById.get(eventId)
  if (!event) return []
  const accounts = new Set(event.stores.flatMap((store) => valuesOf(analysis.storeAccounts, store)))
  const window = eventWindow(event)
  const inWindow = [...accounts].flatMap((account) =>
    valuesOf(analysis.passedByAccount, account).filter((row) => window.from <= row.time && row.time <= window.until)
  )
  const gold = event.referenceUrls.flatMap((reference) => {
    const status = parseStatusUrl(reference.url)
    const row = status ? analysis.rowById.get(status.id) : undefined
    return row ? [row] : []
  })
  return [...new Map([...inWindow, ...gold].map((row) => [row.post.id, row])).values()].sort((a, b) => a.time - b.time)
}

/**
 * 配布終了の報告らしい投稿。終了語と景品名が両方ある。
 */
export const isEndReport = (row: PostRow): boolean =>
  row.hits.some((hit) => hit.group === 'end') && row.hits.some((hit) => hit.group === 'item')

export type EventSummary = {
  event: GoldEvent
  refs: Record<ReferenceType, number>
  /** アーカイブに含まれる正例投稿の数 */
  archived: number
  related: number
  /** 期間内に終了語を含む投稿があるのに、終了の参考 URL も実終了日時も無い */
  endCandidate: boolean
}

export const eventSummaries = (analysis: Analysis): EventSummary[] =>
  analysis.events.map((event) => {
    const refs = { announce: 0, start: 0, end: 0 }
    for (const reference of event.referenceUrls) refs[reference.type] += 1
    const related = relatedPosts(analysis, event.uuid)
    const archived = related.filter((row) => row.gold.some((ref) => ref.eventId === event.uuid)).length
    const endCandidate =
      refs.end === 0 &&
      event.endedAt === undefined &&
      related.some((row) => isEndReport(row) && row.gold.length === 0 && row.time >= Date.parse(event.startDate))
    return { event, refs, archived, related: related.length, endCandidate }
  })
