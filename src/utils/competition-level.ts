import dayjs from 'dayjs'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'
import { isEventForCharacter } from '@/utils/event-character'

/**
 * 激戦区レベル。限定配布が「どれだけ早く・どれだけの量が捌けたか」を段階化する。
 */
export const COMPETITION_LEVELS = ['SS+', 'SS', 'S', 'A', 'B', 'C', 'D'] as const
export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number]

export type CompetitionStats = {
  level: CompetitionLevel
  score: number
  /** 集計に使えたイベント数（配り切った回＋配り切れなかった回） */
  sampleSize: number
  /** 配り切った回の平均日数。一度も配り切っていなければ undefined */
  averageDays: number | undefined
  /** 1回あたりの平均配布数 */
  averageQuantity: number
}

/** 配布数の中央値。個数補正の基準値 */
const BASE_QUANTITY = 100

/** 完売までの日数を 0-100 のスコアに写す */
const speedScore = (days: number): number => {
  if (days === 0) return 100
  if (days <= 1) return 85
  if (days <= 3) return 65
  if (days <= 7) return 45
  if (days <= 14) return 25
  if (days <= 30) return 12
  return 5
}

/**
 * 配布数による補正倍率。
 * 線形だと大口配布が過大評価されるため対数で緩やかにする。
 * 50個=0.78 / 100個=1.00 / 200個=1.22 / 300個=1.35
 */
const quantityWeight = (quantity: number): number => 1 + Math.log2(quantity / BASE_QUANTITY) * 0.22

/** スコアの下限とレベルの対応。上から順に判定し、どれにも満たなければ D */
const LEVEL_THRESHOLDS: [CompetitionLevel, number][] = [
  ['SS+', 105],
  ['SS', 92],
  ['S', 75],
  ['A', 55],
  ['B', 35],
  ['C', 18],
  ['D', Number.NEGATIVE_INFINITY]
]

const toLevel = (score: number): CompetitionLevel => {
  const matched = LEVEL_THRESHOLDS.find(([, min]) => score >= min)
  return matched ? matched[0] : 'D'
}

/** イベントの配布上限数。限定数、なければ先着人数を使う */
const distributionLimit = (event: Event): number | undefined => {
  if (event.limitedQuantity !== undefined) return event.limitedQuantity
  return event.conditions.find((c) => c.type === 'first_come')?.quantity
}

/**
 * 対象ビッカメ娘の激戦区レベルを算出する。
 *
 * 配布上限があるイベントのうち、結果が確定したものだけを見る。
 * - 早く配り切った（endedAt あり）……日数が短いほど高スコア
 * - 期間いっぱい残った（終了済みで endedAt なし）……最低スコア。配り切れなかった実績として扱う
 *
 * 開催中・開催前は結果が出ていないため除外する。終了日が決まっていない
 * 「なくなり次第終了」も、残ったのか続いているのか判別できないため除外する。
 * 名刺のように上限が設定されないものは自然に対象外となる。
 */
export const calculateCompetitionStats = (
  events: Event[],
  storeKey: StoreKey,
  now: Date = dayjs().toDate()
): CompetitionStats | null => {
  const records = events.flatMap((event) => {
    if (!isEventForCharacter(event, storeKey)) return []
    const quantity = distributionLimit(event)
    if (quantity === undefined) return []

    if (event.endedAt) {
      const days = dayjs(event.endedAt).startOf('day').diff(dayjs(event.startDate).startOf('day'), 'day')
      if (days < 0) return []
      return [{ days, quantity, soldOut: true }]
    }

    // 予定期間を終えてもなお配り切れなかったイベント
    if (!event.endDate) return []
    if (dayjs(event.endDate).isAfter(dayjs(now))) return []
    const days = dayjs(event.endDate).startOf('day').diff(dayjs(event.startDate).startOf('day'), 'day')
    if (days < 0) return []
    return [{ days, quantity, soldOut: false }]
  })

  if (records.length === 0) return null

  // 配り切れなかった回は、期間の長短にかかわらず需要が供給に届かなかったことを意味する
  const score =
    records.reduce((sum, r) => sum + (r.soldOut ? speedScore(r.days) * quantityWeight(r.quantity) : 0), 0) /
    records.length

  const soldOutRecords = records.filter((r) => r.soldOut)

  return {
    level: toLevel(score),
    score,
    sampleSize: records.length,
    averageDays:
      soldOutRecords.length > 0
        ? soldOutRecords.reduce((sum, r) => sum + r.days, 0) / soldOutRecords.length
        : undefined,
    averageQuantity: Math.round(records.reduce((sum, r) => sum + r.quantity, 0) / records.length)
  }
}
