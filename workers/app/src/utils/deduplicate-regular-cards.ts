import type { Event } from '@/schemas/event.dto'

/** 重複判定に使う項目だけを要求する（店舗が空のデータも防御的に扱うため stores は緩い型にする） */
type RegularCardCandidate = {
  category: Event['category']
  title: string
  stores: readonly string[]
  characterId?: string
}

/**
 * 通常名刺の重複判定キー。店舗と対象ビッカメ娘の組で決まる。
 * characterId が未指定のイベントは開催店舗と同じ娘が対象なので、店舗キーをそのまま娘として扱う
 */
const regularCardKey = (store: string, event: RegularCardCandidate): string =>
  `${store}/${event.characterId === undefined ? store : event.characterId}`

/**
 * 通常名刺（regular_card）の重複を排除し、同じ店舗・同じ娘の通常名刺は先頭の1件だけを残す
 * 同じ店舗でも別の娘の通常名刺（characterId が異なるもの）は別物として両方残す
 * 通常名刺以外のカテゴリは除去せず、元の順序も変えない
 * @param events 並び替え済みのイベント一覧（先に出てきたものが残る）
 * @returns 重複排除されたイベント一覧
 */
export const deduplicateRegularCards = <T extends RegularCardCandidate>(events: T[]): T[] => {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (event.category !== 'regular_card') {
      return true
    }
    for (const store of event.stores) {
      const key = regularCardKey(store, event)
      if (seen.has(key)) {
        return false // 既にこの店舗・この娘の通常名刺がある
      }
      seen.add(key)
    }
    // 店舗がない場合はタイトルで判定
    if (event.stores.length === 0) {
      const key = `no-store-${event.title}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
    }
    return true
  })
}
