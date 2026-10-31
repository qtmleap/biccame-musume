import { STORE_NAME_LABELS } from '@biccame/shared/domain/character-names'
import { explicitTargetCharacters, resolveEventCharacters } from '@biccame/shared/domain/event-character'
import { eventOgPlace } from '@biccame/shared/domain/og-event-place'
import { SITE_BASE } from '@biccame/shared/domain/tweet-text'
import type { Event, EventCharacter } from '@biccame/shared/schemas/event.dto'
import {
  isSocialSideImage,
  MAX_IMAGES_PER_POST,
  MAX_ROWS_PER_SIDE,
  ROWS_PER_IMAGE,
  type SocialEventView,
  type SocialImage,
  type SocialRow,
  type SocialSide,
  type SocialSideImage,
  type SocialSnapshot,
  type SocialSummaryImage
} from '@biccame/shared/social'
import dayjs, { type Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { eventConditionLabel } from './event-condition'

dayjs.extend(utc)

export type SocialSummaryKind = 'daily' | 'weekly'
export type SocialSummaryEvents = { starting: Event[]; ending: Event[] }

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const
// JST は夏時間がないため、端末のタイムゾーンに依存しない固定オフセットを使う。
const JST_OFFSET_MINUTES = 9 * 60

/* ------------------------------------------------------------------ */
/* 日付                                                                 */
/* ------------------------------------------------------------------ */

export const jstDay = (value: Date | string): Dayjs => dayjs.utc(value).utcOffset(JST_OFFSET_MINUTES)
const dateKey = (day: Dayjs): string => day.format('YYYY-MM-DD')
/** 「M/D(曜)」。 */
export const formatMonthDay = (day: Dayjs): string => `${day.month() + 1}/${day.date()}(${WEEKDAYS[day.day()]})`
/** 「2026年4月29日(水)」。 */
export const formatLongDay = (day: Dayjs): string =>
  `${day.year()}年${day.month() + 1}月${day.date()}日(${WEEKDAYS[day.day()]})`

export const isJstMonday = (scheduledAt: string): boolean => jstDay(scheduledAt).day() === 1
export const jstDateKey = (scheduledAt: string): string => dateKey(jstDay(scheduledAt))

/** JST の月曜 0 時以上、翌月曜 0 時未満の週。 */
export const socialWeekWindow = (scheduledAt: string) => {
  const day = jstDay(scheduledAt).startOf('day')
  const monday = day.subtract((day.day() + 6) % 7, 'day')
  const sunday = monday.add(6, 'day')
  return {
    monday: dateKey(monday),
    sunday: dateKey(sunday),
    headline: `${formatMonthDay(monday)}〜${formatMonthDay(sunday)}`,
    from: monday.toISOString(),
    until: monday.add(7, 'day').toISOString()
  }
}

/** JST の 0 時以上、翌日 0 時未満の1日。 */
export const socialDayWindow = (scheduledAt: string) => {
  const day = jstDay(scheduledAt).startOf('day')
  return {
    day: dateKey(day),
    headline: formatLongDay(day),
    from: day.toISOString(),
    until: day.add(1, 'day').toISOString()
  }
}

/** 投稿（run）のキー。毎朝は JST の日付、毎週はその週の月曜の日付。 */
export const socialPostKey = (kind: SocialSummaryKind, scheduledAt: string): string =>
  kind === 'daily' ? `daily:${socialDayWindow(scheduledAt).day}` : `weekly:${socialWeekWindow(scheduledAt).monday}`

type SummaryWindow = { from: string; until: string; headline: string; textDate: string }
const summaryWindow = (kind: SocialSummaryKind, scheduledAt: string): SummaryWindow => {
  if (kind === 'daily') {
    const window = socialDayWindow(scheduledAt)
    return { from: window.from, until: window.until, headline: window.headline, textDate: window.day }
  }
  const window = socialWeekWindow(scheduledAt)
  return {
    from: window.from,
    until: window.until,
    headline: window.headline,
    textDate: `${window.monday} 〜 ${window.sunday}`
  }
}

/* ------------------------------------------------------------------ */
/* イベントの表記                                                        */
/* ------------------------------------------------------------------ */

/** 終了日。実際の終了（endedAt）があれば予定（endDate）より優先する。 */
const eventEnd = (event: Event): Date | null => {
  if (event.endedAt !== undefined) return event.endedAt
  return event.endDate === undefined ? null : event.endDate
}

const isOneDay = (event: Event): boolean => {
  const end = eventEnd(event)
  return end !== null && dateKey(jstDay(end)) === dateKey(jstDay(event.startDate))
}

/** 条件ラベル。限定数は「限定N個」として末尾に足す。 */
export const eventConditionTexts = (event: Event): string[] => [
  ...event.conditions.map(eventConditionLabel),
  ...(event.limitedQuantity === undefined ? [] : [`限定${event.limitedQuantity}個`])
]

/** 追加・更新の1件表示の期間。曜日付きで、終了日未定と1日だけを書き分ける。 */
export const eventPeriodText = (event: Event): string => {
  const start = formatMonthDay(jstDay(event.startDate))
  const end = eventEnd(event)
  if (end === null) return `${start} 〜 終了日未定`
  return isOneDay(event) ? `${start} のみ` : `${start} 〜 ${formatMonthDay(jstDay(end))}`
}

/**
 * 毎朝・毎週の行の期間。開始側は「M/D(曜)まで」（終了日が無ければ「終了日未定」）で、終了側は無し。
 * 開始日と終了日が同じ日のイベントだけは、どちらの側でも「1日のみ」。
 */
export const rowPeriodText = (event: Event, side: SocialSide): string | null => {
  const end = eventEnd(event)
  if (end === null) return side === 'starting' ? '終了日未定' : null
  if (isOneDay(event)) return '1日のみ'
  return side === 'starting' ? `${formatMonthDay(jstDay(end))}まで` : null
}

/** 開催店舗とは独立した対象全員のラベル。特殊値もそのまま表示する。 */
const eventTarget = (event: Event): string | null => eventOgPlace(event).character

/** 行の対象ラベル。まとめたイベントの全部が同じ娘を指すときだけ出す。 */
const rowTarget = (events: Event[]): string | null => {
  const [first, ...rest] = events.map(eventTarget)
  return first !== null && rest.every((target) => target === first) ? first : null
}

/** 保存する対象全員。立ち絵の描画上限とは独立して保持する。 */
const eventAvatars = (event: Event): EventCharacter[] => resolveEventCharacters(event)

/** 追加・更新の1件表示に載せる内容。 */
export const socialEventView = (event: Event): SocialEventView => ({
  uuid: event.uuid,
  title: event.title,
  stores: event.stores.map((store) => STORE_NAME_LABELS[store]),
  avatars: eventAvatars(event),
  target: eventTarget(event),
  period: eventPeriodText(event),
  conditions: eventConditionTexts(event)
})

/* ------------------------------------------------------------------ */
/* 並べ替え・まとめ・分割                                                  */
/* ------------------------------------------------------------------ */

const compareByStart = (a: Event, b: Event): number =>
  a.startDate.getTime() - b.startDate.getTime() || a.uuid.localeCompare(b.uuid)

const endTime = (event: Event): number => {
  const end = eventEnd(event)
  // 終了日が無いイベントは終了の一覧に入らない前提だが、並べ替えでは最後に回して順序を決定的にする。
  return end === null ? Number.MAX_SAFE_INTEGER : end.getTime()
}
const compareByEnd = (a: Event, b: Event): number => endTime(a) - endTime(b) || a.uuid.localeCompare(b.uuid)

/** 開始は startDate → uuid、終了は終了日（endedAt 優先）→ uuid。 */
export const sortSideEvents = (side: SocialSide, events: Event[]): Event[] =>
  events.slice().sort(side === 'starting' ? compareByStart : compareByEnd)

/**
 * まとめキー: 題名・開始日・終了日（endedAt 優先）・条件（限定数を含む）・明示された対象の娘が同じなら1行にまとめる。
 * 対象の娘は explicitTargetCharacters。娘が空でも、娘の集合が開催店舗の集合と同じ（バックフィルの既定）でも同じ行になり、
 * それ以外の娘が明示されたイベントだけが分かれる。
 * 条件は D1 から返る順が保証されないため、並べ替えてからキーに入れる（表示には出さない）。
 */
const mergeKey = (event: Event): string => {
  const end = eventEnd(event)
  return JSON.stringify([
    event.title,
    dateKey(jstDay(event.startDate)),
    end === null ? null : dateKey(jstDay(end)),
    event.conditions.map(eventConditionLabel).toSorted(),
    event.limitedQuantity === undefined ? null : event.limitedQuantity,
    explicitTargetCharacters(event)
  ])
}

/** 並べ替え済みの入力を、最初に現れた位置でまとめる。 */
const groupEvents = (events: Event[]): Event[][] => {
  const groups = new Map<string, Event[]>()
  for (const event of events) {
    const key = mergeKey(event)
    const group = groups.get(key)
    groups.set(key, group === undefined ? [event] : [...group, event])
  }
  return [...groups.values()]
}

/** 毎週の左端日付。開始の側は開始日、終了の側は終了日（endedAt 優先）。 */
const rowDate = (event: Event, side: SocialSide): string | null => {
  if (side === 'starting') return formatMonthDay(jstDay(event.startDate))
  const end = eventEnd(event)
  return end === null ? null : formatMonthDay(jstDay(end))
}

/** まとめた行のアバターは、グループ全員の娘の和集合（重複なし、最初に現れた順）。描画側が上限を持つ。 */
const toRow = (group: Event[], side: SocialSide, kind: SocialSummaryKind): SocialRow => {
  const [first] = group
  return {
    eventIds: group.map((event) => event.uuid),
    title: first.title,
    stores: [...new Set(group.flatMap((event) => event.stores))].map((store) => STORE_NAME_LABELS[store]),
    avatars: [...new Set(group.flatMap((event) => eventAvatars(event)))],
    target: rowTarget(group),
    period: rowPeriodText(first, side),
    date: kind === 'weekly' ? rowDate(first, side) : null
  }
}

/** 同じ日付が続く行は、先頭の行だけ日付を残す（曜日見出しのように1つにまとめて見せる）。 */
export const omitRepeatedDates = (rows: SocialRow[]): SocialRow[] =>
  rows.map((row, index) =>
    index > 0 && row.date !== null && row.date === rows[index - 1].date ? { ...row, date: null } : row
  )

const chunk = <Item>(items: Item[], size: number): Item[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))

/**
 * 行を4行ずつの画像に分ける。8行までは全部載せ（1枚、または4 + 残り）、9行以上は4 + 4にして残りを隠す。
 */
export const splitSideRows = (rows: SocialRow[]): { pages: SocialRow[][]; hidden: SocialRow[] } => ({
  pages: chunk(rows.slice(0, MAX_ROWS_PER_SIDE), ROWS_PER_IMAGE),
  hidden: rows.slice(MAX_ROWS_PER_SIDE)
})

/**
 * 片側の画像を作る。0件の側は文字だけの画像1枚。
 * 「ほか N件」の N は、隠れた行がまとめた元イベントの数（行数ではない）。隠れた行の uuid も最後の画像に持たせ、
 * 公開確認で隠れたイベントも対象にする（後から非公開になったものを件数に数えたまま投稿しない）。
 */
const planSide = (side: SocialSide, events: Event[], kind: SocialSummaryKind, headline: string): SocialSideImage[] => {
  if (events.length === 0) return [{ type: 'empty', side, headline }]
  const rows = groupEvents(sortSideEvents(side, events)).map((group) => toRow(group, side, kind))
  const { pages, hidden } = splitSideRows(rows)
  const hiddenEventIds = hidden.flatMap((row) => row.eventIds)
  return pages.map(
    (pageRows, index): SocialSummaryImage => ({
      type: 'summary',
      side,
      headline,
      page: index + 1,
      pageCount: pages.length,
      rows: omitRepeatedDates(pageRows),
      total: events.length,
      ...(index === pages.length - 1 && hiddenEventIds.length > 0
        ? { more: hiddenEventIds.length, hiddenEventIds }
        : { hiddenEventIds: [] })
    })
  )
}

/* ------------------------------------------------------------------ */
/* 投稿本文                                                             */
/* ------------------------------------------------------------------ */

const EVENTS_URL = `${SITE_BASE}/events`
const HASHTAGS = '#ビッカメ娘 #ビックカメラ'

/** 毎朝・毎週の投稿本文。件数は元イベント数。追加・更新の本文は tweet-text の buildEventCreatedText / buildEventUpdatedText を使う。 */
export const summaryPostText = (kind: SocialSummaryKind, textDate: string, starting: number, ending: number): string =>
  kind === 'daily'
    ? `本日開始 ${starting}件・本日最終日 ${ending}件\n${textDate}\n${EVENTS_URL}\n${HASHTAGS}`
    : `今週開始 ${starting}件・今週終了 ${ending}件\n${textDate}\n${EVENTS_URL}\n${HASHTAGS}`

/* ------------------------------------------------------------------ */
/* 検査                                                                 */
/* ------------------------------------------------------------------ */

const invariant = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`Social snapshot invariant violated: ${message}`)
}

type CoverageInput = {
  side: SocialSide
  /** その側に渡した元イベントの uuid（画像の組み立てとは独立に数えた入力）。 */
  inputIds: string[]
  /** 投稿の全画像（両側）。 */
  images: SocialImage[]
}

/**
 * 構築時・単体テスト用の件数検査。片側について、次を確かめる。
 * - 画像は0件側が1枚、それ以外は1〜2枚で、ページ番号と見出しの件数（total）が合っている
 * - 全画像に表示した行の uuid と、隠した行の uuid の和集合が入力と一致し、重複がない
 * - 「ほか N」は隠れた行の元イベント数で、8行を超えるときだけ最後の画像（4行ある）に入る
 * - 1投稿の画像は4枚以下
 */
export const assertCoverage = ({ side, inputIds, images }: CoverageInput): void => {
  invariant(images.length >= 1 && images.length <= MAX_IMAGES_PER_POST, `${images.length} images`)
  const own = images.filter(isSocialSideImage).filter((image) => image.side === side)
  if (inputIds.length === 0) {
    invariant(own.length === 1 && own[0].type === 'empty', `${side}: expected one empty image`)
    return
  }
  const summaries = own.filter((image): image is SocialSummaryImage => image.type === 'summary')
  invariant(summaries.length >= 1 && summaries.length === own.length, `${side}: ${own.length} images`)
  summaries.forEach((image, index) => {
    invariant(image.page === index + 1 && image.pageCount === summaries.length, `${side}: page numbering`)
    invariant(image.total === inputIds.length, `${side}: total ${image.total} != input ${inputIds.length}`)
    invariant(image.rows.length <= ROWS_PER_IMAGE, `${side}: ${image.rows.length} rows`)
    const last = index === summaries.length - 1
    invariant(
      last || (image.more === undefined && image.hiddenEventIds.length === 0),
      `${side}: more on a non-last image`
    )
  })
  const shown = summaries.flatMap((image) => image.rows.flatMap((row) => row.eventIds))
  const hidden = summaries.flatMap((image) => image.hiddenEventIds)
  const all = [...shown, ...hidden]
  invariant(new Set(all).size === all.length, `${side}: duplicated event among shown and hidden`)
  invariant(
    all.length === inputIds.length && inputIds.every((id) => all.includes(id)),
    `${side}: shown ${shown.length} + hidden ${hidden.length} do not match the input ${inputIds.length}`
  )
  const [tail] = summaries.slice(-1)
  // 隠れた行があるのは、前の画像が満杯（4行 + 4行）のときだけ。「ほか N」は隠れた元イベント数と一致する。
  invariant(
    tail.more === (hidden.length > 0 ? hidden.length : undefined),
    `${side}: more ${tail.more} != hidden ${hidden.length}`
  )
  invariant(
    hidden.length === 0 || (summaries.length === 2 && summaries.every((image) => image.rows.length === ROWS_PER_IMAGE)),
    `${side}: hidden rows without two full images`
  )
}

/* ------------------------------------------------------------------ */
/* 毎朝・毎週のスナップショット                                              */
/* ------------------------------------------------------------------ */

/** 一覧のイベントが、その側の日付の範囲（開始側は開始日、終了側は終了日）に入っているか。 */
const assertInWindow = (side: SocialSide, events: Event[], window: SummaryWindow): void => {
  const from = dayjs(window.from).valueOf()
  const until = dayjs(window.until).valueOf()
  events.forEach((event) => {
    const at = side === 'starting' ? event.startDate : eventEnd(event)
    invariant(
      at !== null && at.getTime() >= from && at.getTime() < until,
      `${side}: event ${event.uuid} is outside ${window.from} - ${window.until}`
    )
  })
}

/**
 * 1回の実行（run）で開始と終了の両方を1つの投稿のスナップショットにする。
 * 両方0件のときは null（投稿を作らない）。片方だけ0件のときは、0件側に文字だけの画像を足す。
 * 公開済み（isVerified）のイベントだけを対象にする。範囲外のイベントが混ざっていたら例外にする。
 */
export const buildSummarySnapshot = (input: {
  kind: SocialSummaryKind
  scheduledAt: string
  starting: Event[]
  ending: Event[]
}): SocialSnapshot | null => {
  const window = summaryWindow(input.kind, input.scheduledAt)
  const starting = input.starting.filter((event) => event.isVerified)
  const ending = input.ending.filter((event) => event.isVerified)
  assertInWindow('starting', starting, window)
  assertInWindow('ending', ending, window)
  if (starting.length === 0 && ending.length === 0) return null
  const images = [
    ...planSide('starting', starting, input.kind, window.headline),
    ...planSide('ending', ending, input.kind, window.headline)
  ]
  assertCoverage({ side: 'starting', inputIds: starting.map((event) => event.uuid), images })
  assertCoverage({ side: 'ending', inputIds: ending.map((event) => event.uuid), images })
  const [firstImage, ...restImages] = images
  return {
    kind: input.kind,
    key: socialPostKey(input.kind, input.scheduledAt),
    scheduledAt: input.scheduledAt,
    text: summaryPostText(input.kind, window.textDate, starting.length, ending.length),
    images: [firstImage, ...restImages]
  }
}
