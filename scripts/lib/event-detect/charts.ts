import type { ChartsResponse } from '@biccame/shared/event-detect/charts'
import { dayjs } from '../../../workers/bot/src/timeline/utils/dayjs'
import { type Analysis, type EmulatedEntry, emulatedEndedDay, type Judgements } from './analysis'

// チャート画面（/admin/event-detect/charts）の集計。全行を 1 回だけ走査して、確率のヒストグラムと月別の件数を数える。

/** 店舗別 LLM イベント数に載せる店舗の数 */
const STORE_LIMIT = 20

/**
 * 確率のヒストグラムの区間数（0.1 刻み）。ChartsResponseSchema の PROBABILITY_BIN_COUNT と同じ値で、テストで一致を確かめる。
 * 値の import にしないのは、bun --hot で動かすビューワが package.json の exports を読み直さず、新しいサブパスを解決できないため
 */
export const PROBABILITY_BIN_COUNT = 10

const JST_OFFSET = 9 * 3_600_000
const DAY = 86_400_000

/**
 * 投稿時刻（epoch ミリ秒）から JST の暦月（YYYY-MM）を引く関数。dayjs の tz は 1 回 30µs ほどかかり、124 万行では
 * 40 秒になるので、JST の日ごとに結果を使い回す。JST は夏時間が無く UTC+9 固定なので、日の切れ目は 9 時間のずらしで決まる。
 */
const jstMonthOf = () => {
  const byDay = new Map<number, string>()
  return (time: number): string => {
    const day = Math.floor((time + JST_OFFSET) / DAY)
    const cached = byDay.get(day)
    if (cached !== undefined) return cached
    const month = dayjs(time).format('YYYY-MM')
    byDay.set(day, month)
    return month
  }
}

/** map からキーの値を引く。無ければ作って入れる */
const entryOf = <V>(map: Map<string, V>, key: string, create: () => V): V => {
  const found = map.get(key)
  if (found !== undefined) return found
  const created = create()
  map.set(key, created)
  return created
}

/** 確率 0〜1 の区間番号。0.1 ちょうどは次の区間に入り、1.0 は最後の区間に入る。チャートの集計と投稿の絞り込み（api.ts）で共有する */
export const binIndex = (probability: number): number =>
  Math.min(PROBABILITY_BIN_COUNT - 1, Math.max(0, Math.floor(probability * PROBABILITY_BIN_COUNT)))

const emptyBins = (): number[] => Array.from({ length: PROBABILITY_BIN_COUNT }, () => 0)

/** 区間の表記。0.0–0.1 のように下限と上限を小数 1 桁で出す */
const binLabel = (index: number): string =>
  `${(index / PROBABILITY_BIN_COUNT).toFixed(1)}–${((index + 1) / PROBABILITY_BIN_COUNT).toFixed(1)}`

const toHistogram = (counts: readonly number[]) => counts.map((count, index) => ({ label: binLabel(index), count }))

/** YYYY-MM を通し番号にする（年 × 12 + 月 - 1）。月の穴埋めで連続した月を数えるのに使う */
const monthIndex = (month: string): number => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1

const monthLabel = (index: number): string =>
  `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`

/**
 * 月ごとの件数を、最初の月から最後の月まで連続させて昇順に並べる。間の月でデータが無いものは empty() の 0 で埋める。
 */
const continuousMonths = <V extends object>(counts: Map<string, V>, empty: () => V): ({ month: string } & V)[] => {
  if (counts.size === 0) return []
  const indexes = [...counts.keys()].map(monthIndex)
  const first = Math.min(...indexes)
  const last = Math.max(...indexes)
  return Array.from({ length: last - first + 1 }, (_, offset) => {
    const month = monthLabel(first + offset)
    const found = counts.get(month)
    return { month, ...(found === undefined ? empty() : found) }
  })
}

const emptyPostCounts = () => ({ posts: 0, candidates: 0 })

const emptyEventCounts = () => ({ llm: 0, llmEnded: 0, d1: 0 })

/**
 * チャート画面の集計。月は JST の YYYY-MM、確率は 0〜1。
 * 確率のヒストグラムは、イベント候補（reason が無い投稿）のうち判定がある投稿だけを数える（判定のキャッシュには
 * 候補でない投稿の判定も入りうるので、判定の側ではなく候補の側から引く）。
 * LLM イベントの月は startDate（YYYY-MM-DD をそのまま JST の日付として読む）の月で、無ければ firstSeen の JST 月。
 * LLM 終了は統計の「終了」（isEmulatedEnded）と同じイベントを数え、月は endedAt があればその月、無ければ endDate の月。
 * D1 イベントの月は startDate（ISO の時刻）の JST 月。
 * emulated を渡さなければ、LLM イベント・LLM 終了・店舗別は 0／空になる。
 */
export const chartStats = (
  analysis: Analysis,
  judgements: Judgements = { llm: new Map(), clef: new Map() },
  emulated: readonly EmulatedEntry[] = []
): ChartsResponse => {
  const monthOf = jstMonthOf()
  const llmAll = emptyBins()
  const llmGold = emptyBins()
  const clef = emptyBins()
  const postsByMonth = new Map<string, ReturnType<typeof emptyPostCounts>>()
  for (const row of analysis.rows) {
    const counts = entryOf(postsByMonth, monthOf(row.time), emptyPostCounts)
    counts.posts += 1
    if (row.reason !== undefined) continue
    counts.candidates += 1
    const llmProbability = judgements.llm.get(row.post.id)
    if (llmProbability !== undefined) {
      const index = binIndex(llmProbability)
      llmAll[index] += 1
      if (row.gold.length > 0) llmGold[index] += 1
    }
    const clefProbability = judgements.clef.get(row.post.id)
    if (clefProbability !== undefined) clef[binIndex(clefProbability)] += 1
  }

  const eventsByMonth = new Map<string, ReturnType<typeof emptyEventCounts>>()
  for (const event of analysis.events)
    entryOf(eventsByMonth, monthOf(Date.parse(event.startDate)), emptyEventCounts).d1 += 1
  const storeCounts = new Map<string, { count: number }>()
  for (const entry of emulated) {
    const startMonth = entry.startDate === undefined ? monthOf(entry.firstSeen) : entry.startDate.slice(0, 7)
    entryOf(eventsByMonth, startMonth, emptyEventCounts).llm += 1
    const endedDay = emulatedEndedDay(entry)
    if (endedDay !== undefined) entryOf(eventsByMonth, endedDay.slice(0, 7), emptyEventCounts).llmEnded += 1
    entryOf(storeCounts, entry.store, () => ({ count: 0 })).count += 1
  }

  return {
    llmProbability: { all: toHistogram(llmAll), gold: toHistogram(llmGold) },
    clefProbability: toHistogram(clef),
    monthlyEvents: continuousMonths(eventsByMonth, emptyEventCounts),
    monthlyPosts: continuousMonths(postsByMonth, emptyPostCounts),
    stores: [...storeCounts.entries()]
      .sort(([storeA, a], [storeB, b]) => {
        const diff = b.count - a.count
        if (diff !== 0) return diff
        return storeA < storeB ? -1 : 1
      })
      .slice(0, STORE_LIMIT)
      .map(([store, { count }]) => ({ store, count }))
  }
}
