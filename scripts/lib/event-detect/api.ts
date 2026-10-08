import { normalizeText } from '@biccame/shared/event-detect/filter'
import {
  type Analysis,
  analyze,
  coverageGaps,
  eventSummaries,
  funnel,
  keywordStats,
  missingGold,
  type PostRow,
  relatedPosts,
  type StoreAccount
} from './analysis'
import { type GoldEvent, parseStatusUrl } from './gold'
import {
  KeywordsRequestSchema,
  LabelRequestSchema,
  type Labels,
  type PostQuery,
  PostQuerySchema,
  type PostView,
  type Summary
} from './schema'

// ローカルビューワの API。dev サーバー（vite-plugin.ts）から切り離してテストできるよう、
// Request → Response の関数として組み立てる。パスは VIEWER_BASE を除いた /api/... で受ける。

export type ApiContext = {
  posts: Parameters<typeof analyze>[0]['posts']
  events: readonly GoldEvent[]
  accounts: readonly StoreAccount[]
  source: { archive: string; from: string; until: string; complete: boolean; pages: number; goldFetchedAt: string }
  labels: Labels
  saveLabels: (labels: Labels) => Promise<void>
  now: () => string
}

export const createApi = (context: ApiContext) => {
  const state = {
    analysis: analyze({ posts: context.posts, events: context.events, accounts: context.accounts }),
    labels: context.labels
  }
  const range = { from: Date.parse(context.source.from), until: Date.parse(context.source.until) }

  const titleOf = (eventId: string) => {
    const event = state.analysis.eventById.get(eventId)
    return event ? event.title : '(不明なイベント)'
  }

  const view = (row: PostRow): PostView => ({
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
    strong: row.strong,
    gold: row.gold.map((ref) => ({ eventId: ref.eventId, type: ref.type, title: titleOf(ref.eventId) })),
    cluster: row.cluster,
    nearbyEvents: row.nearbyEvents.length,
    ...(state.labels[row.post.id] ? { label: state.labels[row.post.id] } : {})
  })

  const summary = (): Summary => {
    const stages = funnel(state.analysis)
    const labels = Object.values(state.labels)
    return {
      source: {
        archive: context.source.archive,
        posts: state.analysis.rows.length,
        from: context.source.from,
        until: context.source.until,
        complete: context.source.complete,
        pages: context.source.pages,
        goldFetchedAt: context.source.goldFetchedAt,
        events: state.analysis.events.length
      },
      funnel: stages,
      totals: { gold: stages[0].gold, goldByType: stages[0].goldByType },
      missingGold: missingGold(state.analysis, range).map(({ id, refs, inRange }) => ({
        id,
        screenName: refs[0].screenName,
        inRange,
        events: refs.map((ref) => ({ eventId: ref.eventId, type: ref.type, title: titleOf(ref.eventId) }))
      })),
      droppedGold: state.analysis.rows
        .filter((row) => row.gold.length > 0 && row.reason !== undefined)
        .sort((a, b) => a.time - b.time)
        .map(view),
      labels: {
        total: labels.length,
        event: labels.filter((label) => label.verdict === 'event').length,
        notEvent: labels.filter((label) => label.verdict === 'not_event').length,
        unsure: labels.filter((label) => label.verdict === 'unsure').length
      }
    }
  }

  const listPosts = (query: PostQuery) => {
    const from = query.from ? Date.parse(`${query.from}T00:00:00+09:00`) : Number.NEGATIVE_INFINITY
    const until = query.until ? Date.parse(`${query.until}T00:00:00+09:00`) + 86_400_000 : Number.POSITIVE_INFINITY
    const needle = query.q ? normalizeText(query.q) : undefined
    const account = query.account ? query.account.toLowerCase() : undefined
    const inScope = scopeFilter(query.scope, state.labels)
    const rows = state.analysis.rows
      .filter(inScope)
      .filter((row) => !account || row.post.screenName.toLowerCase() === account)
      .filter((row) => !query.reason || row.reason === query.reason)
      .filter((row) => from <= row.time && row.time < until)
      .filter((row) => query.dedup === '0' || row.cluster.id === row.post.id)
      .filter((row) => !needle || row.normalized.includes(needle))
      .sort((a, b) => b.time - a.time)
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

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const path = url.pathname
    if (request.method === 'GET' && path === '/api/summary') return Response.json(summary())
    if (request.method === 'GET' && path === '/api/accounts') return Response.json({ accounts: accounts() })
    if (request.method === 'GET' && path === '/api/keywords')
      return Response.json({ keywords: keywordStats(state.analysis) })
    if (request.method === 'POST' && path === '/api/keywords') {
      const body = KeywordsRequestSchema.safeParse(await readJson(request))
      if (!body.success) return badRequest(body.error.message)
      state.analysis = analyze({
        posts: context.posts,
        events: context.events,
        accounts: context.accounts,
        disabled: body.data.disabled
      })
      return Response.json({ keywords: keywordStats(state.analysis) })
    }
    if (request.method === 'GET' && path === '/api/posts') {
      const query = PostQuerySchema.safeParse(Object.fromEntries(url.searchParams))
      if (!query.success) return badRequest(query.error.message)
      return Response.json(listPosts(query.data))
    }
    if (request.method === 'GET' && path === '/api/events')
      return Response.json({ events: eventSummaries(state.analysis).map(eventView) })
    if (request.method === 'GET' && path === '/api/gaps')
      return Response.json({
        gaps: coverageGaps(state.analysis).map((gap) => ({ ...gap, posts: gap.posts.map(view) }))
      })
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
      return row.strong
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
