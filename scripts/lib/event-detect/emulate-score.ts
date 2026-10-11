import type { Analysis } from './analysis'
import type { EmulatedEvent } from './emulate'
import type { GoldEvent } from './gold'

// エミュレートで作ったイベント一覧を D1 と突き合わせる。D1 のイベントは店舗を複数持てるので、
// （イベント, 店舗）の組を 1 件として数える。突き合わせは同じ店舗・開始日の近さ・種別のまとまりで行い、
// 1 対 1 に割り当てる（貪欲法）。

const DAY = 86_400_000

const jstDay = (time: number) => Math.floor((time + 9 * 3_600_000) / DAY)
const isoDay = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY)

const group = (category: string) => (category.endsWith('_card') ? 'card' : category)

type GoldPair = { event: GoldEvent; store: string; startDay: number; endDay?: number; endedDay?: number }

/** エミュレートしたイベントの開始日。本文から取れなければ最初の言及の日 */
const startDayOf = (event: EmulatedEvent) => (event.startDate ? isoDay(event.startDate) : undefined)

/** D1 のイベントと突き合わせてよいか。よければ近さ（小さいほど近い）を返す */
const distance = (emulated: EmulatedEvent, pair: GoldPair): number | undefined => {
  const start = startDayOf(emulated)
  if (start !== undefined) {
    const diff = Math.abs(start - pair.startDay)
    return diff <= 3 ? diff : undefined
  }
  // 開始日が無い: 告知（開始の 45 日前まで）から終了報告までのどこかで最初に言及されていればよい
  const first = jstDay(emulated.firstSeen)
  const last =
    pair.endedDay !== undefined ? pair.endedDay : pair.endDay !== undefined ? pair.endDay : pair.startDay + 120
  return first >= pair.startDay - 45 && first <= last + 7 ? 10 + Math.abs(first - pair.startDay) / 100 : undefined
}

export type EmulationScore = {
  gold: number
  emulated: number
  matched: number
  /** 割り当て済みの D1 イベントにも当てはまる、余分なエミュレートのイベント（同じイベントの作りすぎ） */
  duplicates: number
  /** どの D1 イベントにも当てはまらないエミュレートのイベント（登録漏れ候補か誤検出） */
  extra: number
  categoryAgree: number
  startExact: number
  startKnown: number
  ended: { gold: number; detected: number; within3Days: number }
  postLinks: { total: number; inMatchedEvent: number }
  unmatchedGold: GoldPair[]
  extraEvents: EmulatedEvent[]
  duplicateEvents: EmulatedEvent[]
}

export const scoreEmulation = (options: {
  events: readonly EmulatedEvent[]
  gold: readonly GoldEvent[]
  analysis: Analysis
  /** 評価する期間（D1 の開始日とエミュレートの最初の言及の両方に適用） */
  from: number
  until: number
  /** アーカイブにアカウントがある店舗だけを数える */
  stores: ReadonlySet<string>
}): EmulationScore => {
  const fromDay = jstDay(options.from)
  const untilDay = jstDay(options.until)
  const pairs: GoldPair[] = options.gold.flatMap((event) => {
    const startDay = jstDay(Date.parse(event.startDate))
    if (startDay < fromDay || startDay >= untilDay) return []
    return event.stores
      .filter((store) => options.stores.has(store))
      .map((store) => ({
        event,
        store,
        startDay,
        ...(event.endDate ? { endDay: jstDay(Date.parse(event.endDate)) } : {}),
        ...(event.endedAt ? { endedDay: jstDay(Date.parse(event.endedAt)) } : {})
      }))
  })
  const emulated = options.events.filter((event) => {
    const day = jstDay(event.firstSeen)
    return day >= fromDay && day < untilDay
  })

  // 候補の組を近い順に並べ、まだ使っていない者どうしを割り当てる
  const candidates = emulated.flatMap((event, e) =>
    pairs.flatMap((pair, p) => {
      if (pair.store !== event.store) return []
      const d = distance(event, pair)
      if (d === undefined) return []
      return [{ e, p, score: d + (group(event.category) === group(pair.event.category) ? 0 : 5) }]
    })
  )
  candidates.sort((a, b) => a.score - b.score)
  const usedEvent = new Set<number>()
  const usedPair = new Set<number>()
  const matches: { e: number; p: number }[] = []
  for (const candidate of candidates) {
    if (usedEvent.has(candidate.e) || usedPair.has(candidate.p)) continue
    usedEvent.add(candidate.e)
    usedPair.add(candidate.p)
    matches.push(candidate)
  }
  const reachable = new Set(candidates.map((candidate) => candidate.e))
  const duplicateEvents = emulated.filter((_, e) => !usedEvent.has(e) && reachable.has(e))
  const extraEvents = emulated.filter((_, e) => !usedEvent.has(e) && !reachable.has(e))

  const score: EmulationScore = {
    gold: pairs.length,
    emulated: emulated.length,
    matched: matches.length,
    duplicates: duplicateEvents.length,
    extra: extraEvents.length,
    categoryAgree: 0,
    startExact: 0,
    startKnown: 0,
    ended: { gold: 0, detected: 0, within3Days: 0 },
    postLinks: { total: 0, inMatchedEvent: 0 },
    unmatchedGold: pairs.filter((_, p) => !usedPair.has(p)),
    extraEvents,
    duplicateEvents
  }
  for (const { e, p } of matches) {
    const event = emulated[e]
    const pair = pairs[p]
    if (group(event.category) === group(pair.event.category)) score.categoryAgree += 1
    const start = startDayOf(event)
    if (start !== undefined) {
      score.startKnown += 1
      if (start === pair.startDay) score.startExact += 1
    }
    if (pair.endedDay !== undefined) {
      score.ended.gold += 1
      if (event.endedAt) {
        score.ended.detected += 1
        if (Math.abs(isoDay(event.endedAt) - pair.endedDay) <= 3) score.ended.within3Days += 1
      }
    }
    // D1 の参考 URL が指す投稿のうちアーカイブにあるものが、割り当てたイベントに入っているか
    const posts = new Set(event.posts.map((post) => post.postId))
    for (const [postId, refs] of options.analysis.goldIndex) {
      if (!refs.some((ref) => ref.eventId === pair.event.uuid)) continue
      if (!options.analysis.rowById.has(postId)) continue
      score.postLinks.total += 1
      if (posts.has(postId)) score.postLinks.inMatchedEvent += 1
    }
  }
  return score
}
