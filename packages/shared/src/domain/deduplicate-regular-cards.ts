import type { Event } from '@biccame/shared/schemas/event.dto'

/** 店舗が空のデータも防御的に扱い、対象ビッカメ娘は別の配列として受け取る。 */
type RegularCardCandidate = {
  category: Event['category']
  title: string
  stores: readonly string[]
  characterIds: readonly string[]
}

/** 両方の集合全体が一致する場合だけ同じ名刺とし、一部の共通対象だけで削除しない。 */
const regularCardKey = (event: RegularCardCandidate): string =>
  JSON.stringify([
    [...new Set(event.stores)].sort(),
    [...new Set(event.characterIds)].sort(),
    event.stores.length === 0 ? event.title : null
  ])

/** 通常名刺だけ先頭優先で重複排除する。対象未判定の名刺は店舗から推測せず、すべて保持する。 */
export const deduplicateRegularCards = <T extends RegularCardCandidate>(events: T[]): T[] => {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (event.category !== 'regular_card' || event.characterIds.length === 0) return true
    const key = regularCardKey(event)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
