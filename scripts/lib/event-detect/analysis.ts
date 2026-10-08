import {
  classifyPost,
  DROP_REASONS,
  type DropReason,
  dedupKey,
  KEYWORDS,
  type KeywordHit,
  matchKeywords,
  normalizeText
} from '@biccame/shared/event-detect/filter'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { buildGoldIndex, type GoldEvent, type GoldRef, parseStatusUrl, type ReferenceType, snowflakeTime } from './gold'

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
  reason: DropReason | undefined
  hits: KeywordHit[]
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
  disabled?: Iterable<string>
}): Analysis => {
  const disabled = new Set(input.disabled)
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
    const verdict = classifyPost(post, { storeAccounts: storeAccountSet, disabled })
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
  return { rows, rowById, events, eventById, storeAccounts, accountStores, goldIndex, passedByAccount, disabled }
}

const REFERENCE_TYPES: readonly ReferenceType[] = ['announce', 'start', 'end']

export type FunnelStage = {
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
export const funnel = (analysis: Analysis): FunnelStage[] => {
  const labels: Record<DropReason, string> = {
    retweet: 'リツイートを除外',
    reply_to_other: '他アカウント宛てリプライを除外',
    non_store_account: '店舗アカウント以外を除外',
    no_keyword: 'キーワードを含まないものを除外'
  }
  const stages: FunnelStage[] = [
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

/**
 * キーワードごとの寄与。構造で落ちた投稿は数えない。
 */
export const keywordStats = (analysis: Analysis): KeywordStat[] => {
  const candidates = analysis.rows.filter((row) => row.reason === undefined || row.reason === 'no_keyword')
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
