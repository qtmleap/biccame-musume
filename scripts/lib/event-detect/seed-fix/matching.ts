import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import dayjs from 'dayjs'
import type { SeedEvent } from '../seed'
import { jstDayOf } from '../seed'
import { pushTo } from './common'
import type { ReportEntry } from './reports-input'
import type { SnapshotEvent } from './snapshot'

export type MatchedEvent = {
  event: SnapshotEvent
  entry: ReportEntry
  emulated: SeedEvent
  store: string
  startDay: string
}

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

/**
 * 作成時刻は時刻として比べる。D1 の created_at は Prisma の形式（+00:00）に揃えられ、レポートの generatedAt は Z 付きのまま残るため。
 * 読めない値は元の文字列のまま比べる（手で作った行を取り違えない）。
 */
const instantKey = (value: string) => (dayjs(value).isValid() ? toD1DateTime(value) : value)

/** (店舗, 開始日, 題, 作成時刻) の組。作成時刻はレポートの generatedAt と D1 の created_at が一致するはずなので、手で作った行を除く鍵になる */
const matchKey = (store: string, day: string, title: string, createdAt: string) =>
  JSON.stringify([store, day, title, instantKey(createdAt)])

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
    if (known === undefined || !known.some((row) => row.emulatedId === entry.emulatedId))
      pushTo(reportIndex, key, entry)
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
