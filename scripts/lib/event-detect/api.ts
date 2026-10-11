import type { ChartsResponse } from '@biccame/shared/event-detect/charts'
import { normalizeText } from '@biccame/shared/event-detect/filter'
import { dayjs } from '../../../workers/bot/src/timeline/utils/dayjs'
import {
  type Analysis,
  analyze,
  coverageGaps,
  type EmulatedFile,
  emulatedYearOf,
  eventSummaries,
  excludeStats,
  isEmulatedEnded,
  type Judgements,
  keywordStats,
  type PostRow,
  postStats,
  relatedPosts,
  rescueStats,
  type StoreAccount
} from './analysis'
import { binIndex, chartStats } from './charts'
import type { GapEventsFile } from './gap-events'
import { type GoldEvent, parseStatusUrl } from './gold'
import {
  type EmulatedDetailResponse,
  type EmulatedEventRow,
  EmulatedIdSchema,
  type EmulatedQuery,
  EmulatedQuerySchema,
  type EmulatedResponse,
  type EmulatedVerify,
  GAP_STATUSES,
  type GapEvent,
  type GapsResponse,
  type GapStatus,
  type GapVerify,
  KeywordsRequestSchema,
  LabelRequestSchema,
  type Labels,
  type PostQuery,
  PostQuerySchema,
  type PostView,
  type Summary
} from './schema'

// ローカルビューワの API。配信側（scripts/lib/event-detect/serve.ts）から切り離してテストできるよう、
// Request → Response の関数として組み立てる。パスは VIEWER_BASE を除いた /api/... で受ける。

export type ApiContext = {
  posts: Parameters<typeof analyze>[0]['posts']
  events: readonly GoldEvent[]
  accounts: readonly StoreAccount[]
  characterNames: readonly string[]
  source: { archive: string; complete: boolean; pages: number; goldFetchedAt: string }
  labels: Labels
  /** LLM・Clef の判定（ローカルのキャッシュ）。統計の年別に使う。読み込み時点のもので、リクエストでは読み直さない */
  judgements: Judgements
  /** emulate コマンドの結果。実行していなければ undefined。統計の年別・アカウント別に使う。読み込み時点のもので、リクエストでは読み直さない */
  emulated: EmulatedFile | undefined
  saveLabels: (labels: Labels) => Promise<void>
  /** gaps コマンドの結果。実行していなければ undefined。リクエストのたびに呼ぶ */
  readGapEvents: () => Promise<GapEventsFile | undefined>
  now: () => string
}

/** gap-events.json の言及を、投稿ごとに 1 件へまとめる途中の状態 */
type GapMention = {
  row: PostRow
  status: GapStatus
  seen: Set<GapStatus>
  /** 再確認の結果と、それを持つ言及の index */
  verify?: { index: number; record: GapVerify }
}

/** emulated-v1.json の言及を、投稿ごとに 1 件へまとめたもの */
type EmulatedMention = {
  row: PostRow
  /** 同じ投稿が複数の状態で載っていれば、最も進んだ状態 */
  status: GapStatus
  /** 再確認の結果と、それを持つ言及の index（最小のもの） */
  verify?: { index: number; record: EmulatedVerify }
}

/** LLM イベント 1 件。一覧の行と、並べ替え・検索に使う値、まとめた言及を持つ */
type EmulatedItem = {
  row: EmulatedEventRow
  /** normalizeText 済みの配布物名。検索に使う */
  normalizedItem: string
  /** 最初・最後の言及の投稿時刻（epoch ミリ秒）。並べ替えに使う */
  firstSeen: number
  lastSeen: number
  /** 今の分析にある投稿だけ。古い順 */
  mentions: EmulatedMention[]
}

export const createApi = (context: ApiContext) => {
  const state: {
    analysis: Analysis
    labels: Labels
    /** チャートの集計。どの analysis から作ったかを持ち、analysis が作り直されたら使わない */
    charts?: { analysis: Analysis; result: ChartsResponse }
    /** LLM イベントの行。言及は analysis の投稿に結びつけるので、analysis が作り直されたら作り直す */
    emulated?: { analysis: Analysis; items: EmulatedItem[]; byId: Map<string, EmulatedItem> }
  } = {
    analysis: analyze({
      posts: context.posts,
      events: context.events,
      accounts: context.accounts,
      characterNames: context.characterNames
    }),
    labels: context.labels
  }

  const titleOf = (eventId: string) => {
    const event = state.analysis.eventById.get(eventId)
    return event ? event.title : '(不明なイベント)'
  }

  const view = (row: PostRow): PostView => {
    // 判定のキャッシュにある確率は、候補でない投稿にも付ける
    const llm = context.judgements.llm.get(row.post.id)
    const clef = context.judgements.clef.get(row.post.id)
    return {
      id: row.post.id,
      createdAt: row.post.createdAt,
      screenName: row.post.screenName,
      kind: row.post.kind,
      text: row.post.kind === 'retweet' && row.post.retweeted?.text ? row.post.retweeted.text : row.post.text,
      url: row.post.url,
      ...(row.post.replyTo ? { replyTo: row.post.replyTo } : {}),
      ...(row.post.quoted ? { quoted: row.post.quoted } : {}),
      media: row.post.media,
      ...(row.reason ? { reason: row.reason } : {}),
      hits: row.hits,
      excludeHits: row.excludeHits,
      rescueHits: row.rescueHits,
      strong: row.strong,
      gold: row.gold.map((ref) => ({ eventId: ref.eventId, type: ref.type, title: titleOf(ref.eventId) })),
      cluster: row.cluster,
      nearbyEvents: row.nearbyEvents.length,
      ...(state.labels[row.post.id] ? { label: state.labels[row.post.id] } : {}),
      ...(llm === undefined ? {} : { llm }),
      ...(clef === undefined ? {} : { clef })
    }
  }

  const summary = (): Summary => {
    // 投稿の最古・最新（range）は、postStats が全行の走査で選んだもの。投稿が 0 件なら null
    const { years, accounts: accountStats, range } = postStats(
      state.analysis,
      context.accounts,
      context.judgements,
      context.emulated ? context.emulated.events : []
    )
    const labels = Object.values(state.labels)
    const sum = (pick: (year: (typeof years)[number]) => number) => years.reduce((total, year) => total + pick(year), 0)
    return {
      source: {
        archive: context.source.archive,
        posts: state.analysis.rows.length,
        oldest: range.oldest,
        newest: range.newest,
        complete: context.source.complete,
        pages: context.source.pages,
        goldFetchedAt: context.source.goldFetchedAt,
        events: state.analysis.events.length,
        emulatedAt: context.emulated ? context.emulated.emulatedAt : null
      },
      totals: {
        posts: sum((year) => year.posts),
        candidates: sum((year) => year.candidates),
        goldPosts: sum((year) => year.goldPosts),
        events: state.analysis.events.length,
        llm: sum((year) => year.llm),
        llmJudged: sum((year) => year.llmJudged),
        clef: sum((year) => year.clef),
        clefJudged: sum((year) => year.clefJudged),
        emulated: sum((year) => year.emulated),
        emulatedEnded: sum((year) => year.emulatedEnded),
        accounts: accountStats.length,
        storeAccounts: accountStats.filter((account) => account.store !== null).length
      },
      years,
      accounts: accountStats,
      labels: {
        total: labels.length,
        event: labels.filter((label) => label.verdict === 'event').length,
        notEvent: labels.filter((label) => label.verdict === 'not_event').length,
        unsure: labels.filter((label) => label.verdict === 'unsure').length
      }
    }
  }

  /** チャートの集計。全行の走査になるので、分析が変わる（キーワードの無効化）までは同じ結果を返す */
  const charts = (): ChartsResponse => {
    const cached = state.charts
    if (cached && cached.analysis === state.analysis) return cached.result
    const result = chartStats(state.analysis, context.judgements, context.emulated ? context.emulated.events : [])
    state.charts = { analysis: state.analysis, result }
    return result
  }

  /**
   * チャートのヒストグラムの区間に入る投稿だけに絞り、確率の降順（同じ確率は新しい順）に並べる。
   * 母集団はチャートと同じで、イベント候補（reason が無い）のうち judge の判定があり、binIndex が bin に等しい投稿。
   * 区間は確率の比較ではなく、チャートと同じ binIndex の一致で見る（浮動小数点の境界で件数がずれないように）
   */
  const inProbabilityBin = (rows: readonly PostRow[], judge: 'llm' | 'clef', bin: number): PostRow[] => {
    const probabilities = context.judgements[judge]
    return rows
      .flatMap((row) => {
        if (row.reason !== undefined) return []
        const probability = probabilities.get(row.post.id)
        return probability !== undefined && binIndex(probability) === bin ? [{ row, probability }] : []
      })
      .sort((a, b) => (a.probability === b.probability ? b.row.time - a.row.time : b.probability - a.probability))
      .map(({ row }) => row)
  }

  const listPosts = (query: PostQuery) => {
    const from = query.from ? Date.parse(`${query.from}T00:00:00+09:00`) : Number.NEGATIVE_INFINITY
    const until = query.until ? Date.parse(`${query.until}T00:00:00+09:00`) + 86_400_000 : Number.POSITIVE_INFINITY
    const needle = query.q ? normalizeText(query.q) : undefined
    const account = query.account ? query.account.toLowerCase() : undefined
    const inScope = scopeFilter(query.scope, state.labels)
    const filtered = state.analysis.rows
      .filter(inScope)
      .filter((row) => !account || row.post.screenName.toLowerCase() === account)
      .filter((row) => !query.reason || row.reason === query.reason)
      .filter((row) => from <= row.time && row.time < until)
      .filter((row) => query.dedup === '0' || row.cluster.id === row.post.id)
      .filter((row) => !needle || row.normalized.includes(needle))
    // judge と bin は両方あるときだけ効く。無ければ新しい順
    const rows =
      query.judge !== undefined && query.bin !== undefined
        ? inProbabilityBin(filtered, query.judge, query.bin)
        : filtered.sort((a, b) => b.time - a.time)
    return { total: rows.length, posts: rows.slice(query.offset, query.offset + query.limit).map(view) }
  }

  const eventView = (summary: ReturnType<typeof eventSummaries>[number]) => ({
    uuid: summary.event.uuid,
    title: summary.event.title,
    category: summary.event.category,
    stores: summary.event.stores,
    startDate: summary.event.startDate,
    ...(summary.event.endDate ? { endDate: summary.event.endDate } : {}),
    ...(summary.event.endedAt ? { endedAt: summary.event.endedAt } : {}),
    refs: summary.refs,
    archived: summary.archived,
    related: summary.related,
    endCandidate: summary.endCandidate
  })

  const accounts = () => {
    const byAccount = new Map<string, { screenName: string; total: number; passed: number; gold: number }>()
    for (const row of state.analysis.rows) {
      const key = row.post.screenName.toLowerCase()
      const entry = byAccount.get(key)
      const current = entry ? entry : { screenName: row.post.screenName, total: 0, passed: 0, gold: 0 }
      current.total += 1
      if (row.reason === undefined) current.passed += 1
      if (row.gold.length > 0) current.gold += 1
      byAccount.set(key, current)
    }
    return [...byAccount.entries()]
      .map(([key, entry]) => {
        const stores = state.analysis.accountStores.get(key)
        return { ...entry, stores: stores ? [...stores] : [] }
      })
      .sort((a, b) => b.passed - a.passed)
  }

  const keywords = () => ({
    keywords: keywordStats(state.analysis),
    excludes: excludeStats(state.analysis),
    rescues: rescueStats(state.analysis)
  })

  /** gaps コマンドがまとめたイベントを、今の分析にある投稿に結びつける */
  const gapEvent = (event: GapEventsFile['events'][number]): GapEvent[] => {
    // 同じ投稿は 1 件にまとめ、状態は最も進んだものにする。分析に無い投稿の言及は飛ばす。
    // 再確認の結果は、その投稿の言及のうち index が最小で再確認をしたものを使う
    const mentions = new Map<string, GapMention>()
    for (const entry of event.posts) {
      const row = state.analysis.rowById.get(entry.postId)
      if (!row) continue
      const found = mentions.get(entry.postId)
      const mention: GapMention = found ? found : { row, status: entry.status, seen: new Set() }
      if (!found) mentions.set(entry.postId, mention)
      mention.seen.add(entry.status)
      if (GAP_STATUSES.indexOf(entry.status) > GAP_STATUSES.indexOf(mention.status)) mention.status = entry.status
      if (entry.verify && (!mention.verify || entry.index < mention.verify.index))
        mention.verify = { index: entry.index, record: entry.verify }
    }
    if (mentions.size === 0) return []
    // 状態ごとの言及は、同じ投稿が同じ状態で複数載っていても 1
    const statusCounts = { announce: 0, start: 0, ongoing: 0, end: 0 }
    for (const { seen } of mentions.values()) for (const status of seen) statusCounts[status] += 1
    return [
      {
        id: event.id,
        store: event.store,
        item: event.item,
        category: event.category,
        status: event.status,
        ...(event.startDate ? { startDate: event.startDate } : {}),
        ...(event.endDate ? { endDate: event.endDate } : {}),
        ...(event.quantity ? { quantity: event.quantity } : {}),
        ...(event.endedAt ? { endedAt: event.endedAt } : {}),
        startUnknown: event.startUnknown,
        firstSeen: dayjs(event.firstSeen).toISOString(),
        lastSeen: dayjs(event.lastSeen).toISOString(),
        mentions: mentions.size,
        statusCounts,
        posts: [...mentions.values()]
          .sort((a, b) => a.row.time - b.row.time)
          .map(({ row, status, verify }) => ({
            status,
            post: view(row),
            ...(verify ? { verify: verify.record } : {})
          }))
      }
    ]
  }

  /**
   * 登録漏れ候補。gaps コマンドの結果が無ければ、今の候補がすべて未集約（pending）になる。
   */
  const gaps = async (): Promise<GapsResponse> => {
    const file = await context.readGapEvents()
    const processed = new Set(file ? file.processed : [])
    const mentioned = new Set((file ? file.events : []).flatMap((event) => event.posts.map((entry) => entry.postId)))
    return {
      generatedAt: file ? file.generatedAt : null,
      verify: file ? file.verify : null,
      events: (file ? file.events : []).flatMap(gapEvent).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
      ignored: [...processed].filter((id) => !mentioned.has(id)).length,
      pending: coverageGaps(state.analysis)
        .flatMap((gap) => gap.posts)
        .filter((row) => !processed.has(row.post.id))
        .sort((a, b) => a.time - b.time)
        .map(view)
    }
  }

  /** emulated-v1.json のイベント 1 件の言及を、今の分析にある投稿に結びつけ、投稿ごとに 1 件へまとめる。古い順 */
  const emulatedMentions = (record: EmulatedFile['events'][number]): EmulatedMention[] => {
    const merged = new Map<string, EmulatedMention>()
    for (const entry of record.posts) {
      const row = state.analysis.rowById.get(entry.postId)
      if (!row) continue
      const found = merged.get(entry.postId)
      const mention: EmulatedMention = found ? found : { row, status: entry.status }
      if (!found) merged.set(entry.postId, mention)
      if (GAP_STATUSES.indexOf(entry.status) > GAP_STATUSES.indexOf(mention.status)) mention.status = entry.status
      if (entry.verify && (!mention.verify || entry.index < mention.verify.index))
        mention.verify = { index: entry.index, record: entry.verify }
    }
    return [...merged.values()].sort((a, b) => a.row.time - b.row.time)
  }

  /** 言及の投稿のうち、D1 の参考 URL になっているものが指す D1 イベント。重複を除き、言及の古い順 */
  const d1Of = (mentions: readonly EmulatedMention[]): EmulatedEventRow['d1'] => {
    const found = new Map<string, EmulatedEventRow['d1'][number]>()
    for (const { row } of mentions)
      for (const ref of row.gold)
        if (!found.has(ref.eventId)) found.set(ref.eventId, { eventId: ref.eventId, title: titleOf(ref.eventId) })
    return [...found.values()]
  }

  /** LLM イベントの行。全件の言及を引くので、分析が変わる（キーワードの無効化）までは同じものを返す */
  const emulatedItems = () => {
    const cached = state.emulated
    if (cached && cached.analysis === state.analysis) return cached
    const yearOf = emulatedYearOf()
    const items = (context.emulated ? context.emulated.events : []).map((record): EmulatedItem => {
      const mentions = emulatedMentions(record)
      return {
        row: {
          id: record.id,
          store: record.store,
          item: record.item,
          category: record.category,
          status: record.status,
          ...(record.startDate ? { startDate: record.startDate } : {}),
          ...(record.endDate ? { endDate: record.endDate } : {}),
          ...(record.endedAt ? { endedAt: record.endedAt } : {}),
          ...(record.quantity ? { quantity: record.quantity } : {}),
          startUnknown: record.startUnknown,
          firstSeen: dayjs(record.firstSeen).toISOString(),
          lastSeen: dayjs(record.lastSeen).toISOString(),
          year: yearOf(record),
          mentions: mentions.length,
          ended: isEmulatedEnded(record),
          d1: d1Of(mentions)
        },
        normalizedItem: normalizeText(record.item),
        firstSeen: record.firstSeen,
        lastSeen: record.lastSeen,
        mentions
      }
    })
    const built = { analysis: state.analysis, items, byId: new Map(items.map((item) => [item.row.id, item])) }
    state.emulated = built
    return built
  }

  const listEmulated = (query: EmulatedQuery): EmulatedResponse => {
    const { items } = emulatedItems()
    const needle = query.q ? normalizeText(query.q) : undefined
    const filtered = items
      .filter(({ row }) => query.year === undefined || row.year === query.year)
      .filter(({ row }) => query.store === undefined || row.store === query.store)
      .filter(({ row }) => query.status === undefined || row.status === query.status)
      .filter(({ row }) => query.ended === undefined || row.ended === (query.ended === '1'))
      .filter(({ row }) => query.d1 === undefined || (row.d1.length > 0) === (query.d1 === 'matched'))
      .filter(({ normalizedItem }) => !needle || normalizedItem.includes(needle))
    const sign = (query.order === undefined ? defaultEmulatedOrder(query.sort) : query.order) === 'asc' ? 1 : -1
    // 並べ替えの列が同じなら、最初の言及が新しい順、さらに同じなら ID の順にして、並びを安定させる
    filtered.sort((a, b) => {
      const primary = compareEmulated(query.sort, a, b) * sign
      if (primary !== 0) return primary
      const byFirstSeen = b.firstSeen - a.firstSeen
      return byFirstSeen !== 0 ? byFirstSeen : compareText(a.row.id, b.row.id)
    })
    return {
      total: filtered.length,
      events: filtered.slice(query.offset, query.offset + query.limit).map(({ row }) => row),
      facets: {
        years: [...tally(items.map(({ row }) => row.year))]
          .map(([year, count]) => ({ year, count }))
          .sort((a, b) => b.year - a.year),
        stores: [...tally(items.map(({ row }) => row.store))]
          .map(([store, count]) => ({ store, count }))
          .sort((a, b) => b.count - a.count || compareText(a.store, b.store))
      },
      emulatedAt: context.emulated ? context.emulated.emulatedAt : null
    }
  }

  const emulatedDetail = (id: string): EmulatedDetailResponse | undefined => {
    const item = emulatedItems().byId.get(id)
    if (!item) return undefined
    return {
      event: item.row,
      posts: item.mentions.map(({ row, status, verify }) => ({
        status,
        ...(verify ? { verify: verify.record } : {}),
        post: view(row)
      }))
    }
  }

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const path = url.pathname
    if (request.method === 'GET' && path === '/api/summary') return Response.json(summary())
    if (request.method === 'GET' && path === '/api/accounts') return Response.json({ accounts: accounts() })
    if (request.method === 'GET' && path === '/api/charts') return Response.json(charts())
    if (request.method === 'GET' && path === '/api/keywords') return Response.json(keywords())
    if (request.method === 'POST' && path === '/api/keywords') {
      const body = KeywordsRequestSchema.safeParse(await readJson(request))
      if (!body.success) return badRequest(body.error.message)
      state.analysis = analyze({
        posts: context.posts,
        events: context.events,
        accounts: context.accounts,
        characterNames: context.characterNames,
        disabled: body.data.disabled,
        disabledExcludes: body.data.disabledExcludes
      })
      return Response.json(keywords())
    }
    if (request.method === 'GET' && path === '/api/posts') {
      const query = PostQuerySchema.safeParse(Object.fromEntries(url.searchParams))
      if (!query.success) return badRequest(query.error.message)
      return Response.json(listPosts(query.data))
    }
    if (request.method === 'GET' && path === '/api/events')
      return Response.json({ events: eventSummaries(state.analysis).map(eventView) })
    if (request.method === 'GET' && path === '/api/gaps') return Response.json(await gaps())
    if (request.method === 'GET' && path === '/api/emulated') {
      const query = EmulatedQuerySchema.safeParse(Object.fromEntries(url.searchParams))
      if (!query.success) return badRequest(query.error.message)
      return Response.json(listEmulated(query.data))
    }
    const emulatedMatch = /^\/api\/emulated\/([^/]+)$/.exec(path)
    if (request.method === 'GET' && emulatedMatch) {
      const id = EmulatedIdSchema.safeParse(emulatedMatch[1])
      const detail = id.success ? emulatedDetail(id.data) : undefined
      return detail ? Response.json(detail) : notFound()
    }
    const eventMatch = /^\/api\/events\/([0-9a-f-]{36})$/.exec(path)
    if (request.method === 'GET' && eventMatch) {
      const summary = eventSummaries(state.analysis).find((entry) => entry.event.uuid === eventMatch[1])
      if (!summary) return notFound()
      return Response.json({
        event: {
          ...eventView(summary),
          referenceUrls: summary.event.referenceUrls.map((reference) => {
            const status = parseStatusUrl(reference.url)
            return { ...reference, archived: status ? state.analysis.rowById.has(status.id) : false }
          })
        },
        posts: relatedPosts(state.analysis, summary.event.uuid).map(view)
      })
    }
    const labelMatch = /^\/api\/labels\/(\d+)$/.exec(path)
    if (labelMatch && (request.method === 'PUT' || request.method === 'DELETE')) {
      if (!state.analysis.rowById.has(labelMatch[1])) return notFound()
      const next = { ...state.labels }
      if (request.method === 'DELETE') delete next[labelMatch[1]]
      else {
        const body = LabelRequestSchema.safeParse(await readJson(request))
        if (!body.success) return badRequest(body.error.message)
        next[labelMatch[1]] = { ...body.data, updatedAt: context.now() }
      }
      await context.saveLabels(next)
      state.labels = next
      return Response.json({ label: next[labelMatch[1]] === undefined ? null : next[labelMatch[1]] })
    }
    return notFound()
  }

  return { handle, analysis: (): Analysis => state.analysis }
}

/** 文字列を順序だけで比べる（ロケールに依らない） */
const compareText = (a: string, b: string): number => {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** 値ごとの件数。出現順に並ぶ */
const tally = <K>(keys: Iterable<K>): Map<K, number> => {
  const counts = new Map<K, number>()
  for (const key of keys) {
    const current = counts.get(key)
    counts.set(key, current === undefined ? 1 : current + 1)
  }
  return counts
}

/** LLM イベント一覧の向きの既定。店舗は昇順、ほかは降順（新しい順・多い順） */
const defaultEmulatedOrder = (sort: EmulatedQuery['sort']): 'asc' | 'desc' => (sort === 'store' ? 'asc' : 'desc')

/** 昇順での比較。同値は 0 */
const compareEmulated = (sort: EmulatedQuery['sort'], a: EmulatedItem, b: EmulatedItem): number => {
  switch (sort) {
    case 'firstSeen':
      return a.firstSeen - b.firstSeen
    case 'lastSeen':
      return a.lastSeen - b.lastSeen
    case 'mentions':
      return a.row.mentions - b.row.mentions
    case 'store':
      return compareText(a.row.store, b.row.store)
  }
}

const scopeFilter = (scope: PostQuery['scope'], labels: Labels) => (row: PostRow) => {
  switch (scope) {
    case 'passed':
      return row.reason === undefined
    case 'dropped':
      return row.reason !== undefined
    case 'all':
      return true
    case 'gold':
      return row.gold.length > 0
    case 'gold_dropped':
      return row.gold.length > 0 && row.reason !== undefined
    case 'unlabeled':
      return row.reason === undefined && row.gold.length === 0 && labels[row.post.id] === undefined
    case 'strong':
      return row.reason === undefined && row.strong
  }
}

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

const badRequest = (message: string) => Response.json({ error: message }, { status: 400 })

const notFound = () => Response.json({ error: 'not found' }, { status: 404 })
