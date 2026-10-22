import { MEASURE_TOLERANCE, type TextMetrics } from '@api/lib/og-text-metrics'
import type { SocialRow, SocialSide } from '@biccame/shared/social'
import {
  ACCENTS,
  type Accent,
  C,
  type Chunk,
  lineHeightOf,
  type SocialImageKind,
  storeChunks,
  type Tone,
  toneOf
} from './social-post-image-common'

export const WIDE_W = 1200
export const WIDE_H = 675
export const PX = 28
export const PTOP = 26
const PBOTTOM = 24
export const PW = WIDE_W - PX * 2

/** 文字サイズ。件数に連動して縮めない（入らない分は「ほか N件」にする）。 */
export const SIZE = {
  info: 34,
  heading: 40,
  date: 44,
  count: 36,
  more: 36,
  empty: 44,
  title: 42,
  titleSmall: 38
} as const

const HEADER_H = lineHeightOf(SIZE.date) + 8 + 4
export const BODY_GAP = 12
export const BODY_H = WIDE_H - PTOP - PBOTTOM - HEADER_H - BODY_GAP
export const MORE_H = lineHeightOf(SIZE.more) + 8

export const ROW_AVATAR_D = 104
export const ROW_GAP = 16
export const ROW_PAD = 8
/** 店舗・対象・期間の間隔。 */
const GROUP_GAP = 28

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 毎週の左端の日付列の幅。「12/28(水)」など、最も幅の広い日付に合わせた固定幅を実測で求める。 */
export const dateColumnWidth = (metrics: TextMetrics): number =>
  Math.ceil(Math.max(...WEEKDAYS.map((weekday) => metrics.width(`12/28(${weekday})`, SIZE.heading)))) + 12

export type Scope = 'daily' | 'weekly'
export const scopeOf = (kind: SocialImageKind): Scope => {
  if (kind === 'daily' || kind === 'weekly') return kind
  throw new Error(`Social summary image requires daily or weekly: ${kind}`)
}

export const sideAccent = (side: SocialSide): Accent => (side === 'starting' ? ACCENTS.red : ACCENTS.teal)
export const sideTone = (side: SocialSide): Tone =>
  side === 'starting' ? { bg: C.mark, text: ACCENTS.red.text, sub: ACCENTS.red.place } : toneOf(ACCENTS.teal)

export const SIDE_TEXT = {
  daily: {
    starting: { label: '今日からはじまるイベント', empty: '今日からはじまるイベントはありません' },
    ending: { label: '今日までのイベント', empty: '今日までのイベントはありません' }
  },
  weekly: {
    starting: { label: '今週はじまるイベント', empty: '今週はじまるイベントはありません' },
    ending: { label: '今週おわるイベント', empty: '今週おわるイベントはありません' }
  }
} as const

/** 1行の題名。42px で1行に収まればそれ、収まらなければ 38px、それでも収まらなければ省略記号（2行にしない）。 */
export const summaryTitleLayout = (
  title: string,
  width: number,
  metrics: TextMetrics
): { size: number; ellipsis: boolean } => {
  const fits = (size: number): boolean => metrics.width(title, size) <= width - MEASURE_TOLERANCE
  if (fits(SIZE.title)) return { size: SIZE.title, ellipsis: false }
  return { size: SIZE.titleSmall, ellipsis: !fits(SIZE.titleSmall) }
}

/** 7店舗以上は、まず先頭5店舗に絞ってから幅に収まる店舗数を探す。 */
const STORE_COUNT_LIMIT = 5
const initialStoreCount = (stores: readonly string[]): number =>
  stores.length > STORE_COUNT_LIMIT + 1 ? STORE_COUNT_LIMIT : stores.length

/** 店舗・対象・期間を1行に並べた塊。最後の塊の右余白は 0。 */
const rowChunks = (row: SocialRow, storeCount: number, withTarget: boolean, accent: Accent): Chunk[] => {
  const groups: Chunk[][] = [
    storeChunks(row.stores, storeCount, accent.place),
    ...(withTarget && row.target !== null ? [[{ text: `対象: ${row.target}`, color: accent.place, after: 0 }]] : []),
    ...(row.period === null ? [] : [[{ text: row.period, color: C.text, after: 0 }]])
  ]
  return groups.flatMap((group, groupIndex) =>
    group.map((chunk, index) =>
      index === group.length - 1 && groupIndex < groups.length - 1 ? { ...chunk, after: GROUP_GAP } : chunk
    )
  )
}

const chunksWidth = (chunks: readonly Chunk[], metrics: TextMetrics): number =>
  chunks.reduce((sum, chunk) => sum + Math.ceil(metrics.width(chunk.text, SIZE.info)) + chunk.after, 0)

export type SummaryRowLayout = {
  title: { size: number; ellipsis: boolean }
  /** 1行目に並べる店舗数（店舗数以上なら全部）。 */
  storeCount: number
  /** 「対象: ○○」を出すか。入らなければ省く。 */
  showTarget: boolean
  chunks: Chunk[]
}

/**
 * 1行（Avatar の右側の文字領域 textWidth）の組み方。文字は縮めず、入らない分だけ内容を減らす。
 * 店舗を店舗数→1店舗まで減らして（残りは「ほか N店舗」）1行に収め、それでも入らなければ「対象」を外す。
 */
export const planSummaryRow = (
  row: SocialRow,
  side: SocialSide,
  textWidth: number,
  metrics: TextMetrics
): SummaryRowLayout => {
  const accent = sideAccent(side)
  const first = initialStoreCount(row.stores)
  const hasTarget = row.target !== null
  const candidates = [
    ...Array.from({ length: first }, (_, index) => ({ storeCount: first - index, showTarget: hasTarget })),
    ...(hasTarget ? [{ storeCount: 1, showTarget: false }] : [])
  ]
  const plans = candidates.map((candidate) => ({
    ...candidate,
    chunks: rowChunks(row, candidate.storeCount, candidate.showTarget, accent)
  }))
  const [last] = plans.slice(-1)
  const fitted = plans.find((plan) => chunksWidth(plan.chunks, metrics) <= textWidth - MEASURE_TOLERANCE)
  return { title: summaryTitleLayout(row.title, textWidth, metrics), ...(fitted === undefined ? last : fitted) }
}
