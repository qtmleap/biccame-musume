import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { CHARACTER_NAME_LABELS, EVENT_CATEGORY_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'
import { isSpecialCharacter, resolveEventCharacter } from '@/utils/event-character'

dayjs.extend(utc)

/** 投稿画像に載せるイベントの項目 */
export type ImageEvent = Pick<
  Event,
  'uuid' | 'title' | 'category' | 'stores' | 'characterId' | 'startDate' | 'endDate' | 'conditions' | 'limitedQuantity'
> & { groupId?: string }

/** 画像1行ぶん（同じグループの店舗違いをまとめたもの） */
export type EventRow = {
  title: string
  /** 「その他」は情報にならないため null */
  category: string | null
  stores: string[]
  otherStoreCount: number
  /** 開催店舗の娘と異なる娘が対象のときだけ、その娘の名前 */
  character: string | null
  /** 立ち絵を出す娘（最大3人） */
  portraits: StoreKey[]
  /** 店舗ごとに条件が違う場合は空 */
  conditions: string[]
  /** 期間などの補足。店舗ごとに違う場合は「店舗により異なる」 */
  note: string
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const
// 1200px幅に収まる店舗数。超えた分は「ほか N 店舗」にまとめる
const MAX_LISTED_STORES = 3
const MAX_PORTRAITS = 3

const jst = (date: Date) => dayjs.utc(date).utcOffset(9 * 60)

/** 6/26(金) の形。年をまたぐ表示のときだけ年を付ける */
export const formatDay = (date: Date, withYear = false): string => {
  const day = jst(date)
  return `${withYear ? `${day.year()}/` : ''}${day.month() + 1}/${day.date()}(${WEEKDAYS[day.day()]})`
}

export const formatPeriod = (start: Date, end: Date | undefined): string => {
  if (!end) return `${formatDay(start)}〜`
  if (jst(start).isSame(jst(end), 'day')) return formatDay(start)
  return `${formatDay(start)}〜${formatDay(end, jst(start).year() !== jst(end).year())}`
}

/** 2026年10月5日(月) の形 */
export const formatLongDay = (date: Date): string => {
  const day = jst(date)
  return `${day.year()}年${day.month() + 1}月${day.date()}日(${WEEKDAYS[day.day()]})`
}

export const isSaturday = (date: Date): boolean => jst(date).day() === 6
export const isSunday = (date: Date): boolean => jst(date).day() === 0

/** JSTの日付ごとにまとめるためのキー */
export const jstDayKey = (date: Date): string => jst(date).format('YYYY-MM-DD')

/** サイトのイベント一覧と同じ言い回しで配布条件を並べる */
export const conditionLabels = (event: Pick<ImageEvent, 'conditions' | 'limitedQuantity'>): string[] => {
  const labels = event.conditions.map((condition) => {
    if (condition.type === 'purchase') {
      return condition.purchaseAmount ? `${condition.purchaseAmount.toLocaleString('ja-JP')}円以上購入` : '購入特典'
    }
    if (condition.type === 'first_come') return condition.quantity ? `先着${condition.quantity}名` : '先着順'
    if (condition.type === 'lottery') return condition.quantity ? `抽選${condition.quantity}名` : '抽選'
    return '全員配布'
  })
  // 先着・抽選の人数があれば限定数は重複になる
  const counted = event.conditions.some((condition) => condition.quantity)
  return event.limitedQuantity && !counted ? [...labels, `限定${event.limitedQuantity}個`] : labels
}

/** 立ち絵を出す娘。対象の娘が決まっていればその娘、そうでなければ開催店舗の娘 */
export const portraitKeys = (event: Pick<ImageEvent, 'stores' | 'characterId'>): StoreKey[] => {
  const resolved = resolveEventCharacter(event)
  if (!isSpecialCharacter(resolved) && event.characterId) return [resolved]
  return [...new Set(event.stores)].slice(0, MAX_PORTRAITS)
}

/** 開催店舗の娘と異なる娘が対象のときだけ、その娘の名前を返す */
export const targetCharacterName = (event: Pick<ImageEvent, 'stores' | 'characterId'>): string | null => {
  const resolved = resolveEventCharacter(event)
  return isSpecialCharacter(resolved) || resolved === event.stores[0] ? null : CHARACTER_NAME_LABELS[resolved]
}

const listStores = (stores: StoreKey[]): { stores: string[]; otherStoreCount: number } => {
  const names = [...new Set(stores)].map((store) => STORE_NAME_LABELS[store])
  const listed = names.length > MAX_LISTED_STORES ? names.slice(0, MAX_LISTED_STORES - 1) : names
  return { stores: listed, otherStoreCount: names.length - listed.length }
}

const same = (values: string[]): boolean => values.every((value) => value === values[0])

/**
 * 店舗違いの同一企画を1行にまとめる。groupId が無いイベントも多いため、同じ種別・同じ題名なら同一とみなす。
 * 呼び出し側で日付ごとに分けてから渡す前提。並び順は最初に現れた順を保つ。
 */
export const groupRows = (events: ImageEvent[], note: (event: ImageEvent) => string): EventRow[] => {
  const groups = new Map<string, ImageEvent[]>()
  for (const event of events) {
    const key = event.groupId === undefined ? `${event.category}:${event.title}` : event.groupId
    const members = groups.get(key)
    if (members) members.push(event)
    else groups.set(key, [event])
  }
  return [...groups.values()].map((members) => {
    const [first] = members
    const characters = [...new Set(members.map(targetCharacterName))]
    const conditions = members.map((member) => conditionLabels(member).join('/'))
    const notes = members.map(note)
    return {
      title: first.title,
      category: first.category === 'other' ? null : EVENT_CATEGORY_LABELS[first.category],
      ...listStores(members.flatMap((member) => member.stores)),
      character: characters.length === 1 ? characters[0] : null,
      portraits: [...new Set(members.flatMap(portraitKeys))].slice(0, MAX_PORTRAITS),
      conditions: same(conditions) ? conditionLabels(first) : [],
      note: same(notes) ? notes[0] : '店舗により異なる'
    }
  })
}

/** イベント1件をカード画像用にまとめる */
export const eventRow = (event: ImageEvent): EventRow =>
  groupRows([event], (only) => formatPeriod(only.startDate, only.endDate))[0]

const SCRIPT = [
  ['kanji', /[\p{Script=Han}々〆ヶ]/u],
  ['kana', /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u],
  ['latin', /[A-Za-z0-9０-９Ａ-Ｚａ-ｚ]/u]
] as const
const scriptOf = (char: string): string => {
  const found = SCRIPT.find(([, pattern]) => pattern.test(char))
  return found ? found[0] : 'other'
}
// この文字の直後は区切りとして自然
const BREAK_AFTER = /[のでとにをはがへやも・＆&+＋、。！!？?）)」』】〜~ ]/u
// この文字の直前で区切ると行頭が不自然になる
const NO_BREAK_BEFORE = /[ー・、。！!？?）)」』】ぁぃぅぇぉっゃゅょァィゥェォッャュョ〜~]/u
// 題名によく出る語。途中で切らない
const WORDS = [
  'ビッカメ娘',
  '周年',
  '記念',
  '名刺',
  '擬人化',
  'アクキー',
  'アクスタ',
  'ポストカード',
  '缶バッジ',
  'カレンダー'
]

/**
 * 日本語の題名を2行に分ける位置を選ぶ。satori の textWrap: balance は分かち書きしない文に効かないため、
 * 中央に近い自然な区切り（助詞・記号の直後、文字種の変わり目）で改行する。1行に収まる長さなら分けない。
 */
export const splitTitle = (title: string, perLine: number): string[] => {
  const chars = [...title]
  if (chars.length <= perLine) return [title]
  const insideWord = (index: number) =>
    WORDS.some((word) => {
      for (let start = Math.max(0, index - word.length + 1); start < index; start++) {
        if (chars.slice(start, start + word.length).join('') === word) return true
      }
      return false
    })
  const score = (index: number): number => {
    const before = chars[index - 1]
    const after = chars[index]
    if (NO_BREAK_BEFORE.test(after) || insideWord(index)) return -1
    // 数字の途中・数字と単位の間は切らない
    if (/[0-9０-９]/u.test(before) && /[0-9０-９周年月日個名円]/u.test(after)) return -1
    if (BREAK_AFTER.test(before)) return 3
    if (scriptOf(before) !== scriptOf(after)) return 2
    return 0
  }
  const middle = chars.length / 2
  const candidates = chars
    .map((_, index) => index)
    .filter((index) => index > 0 && index < chars.length && index <= perLine && chars.length - index <= perLine)
    .map((index) => ({ index, value: score(index) * 4 - Math.abs(index - middle) }))
    .filter((candidate) => score(candidate.index) >= 0)
    .sort((a, b) => b.value - a.value)
  // 自然な区切りが無ければ1行目を目一杯使う
  const index = candidates.length > 0 ? candidates[0].index : Math.min(perLine, Math.ceil(middle))
  return [chars.slice(0, index).join('').trimEnd(), chars.slice(index).join('').trimStart()]
}
