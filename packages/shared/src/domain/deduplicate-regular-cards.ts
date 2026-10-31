import { explicitTargetCharacters } from '@biccame/shared/domain/event-character'
import type { Event } from '@biccame/shared/schemas/event.dto'

/** 店舗が空のデータも防御的に扱い、対象ビッカメ娘は別の配列として受け取る。 */
type RegularCardCandidate = {
  category: Event['category']
  title: string
  stores: readonly Event['stores'][number][]
  characterIds: readonly Event['characterIds'][number][]
}

/**
 * 明示された対象の娘（explicitTargetCharacters）と開催店舗の集合が両方一致する場合だけ同じ名刺とし、
 * 一部の共通対象だけで削除しない。開催店舗の娘に別の娘を足した共同デザインは、別の娘だけの名刺と別の名刺になる。
 */
const regularCardKey = (event: RegularCardCandidate): string =>
  JSON.stringify([
    [...new Set(event.stores)].sort(),
    explicitTargetCharacters(event),
    event.stores.length === 0 ? event.title : null
  ])

/**
 * 通常名刺だけ先頭優先で重複排除する。対象が未判定、または娘の集合が開催店舗の集合と同じ（既定）の名刺は、
 * 店舗から推測せず、すべて保持する。それ以外の明示された名刺だけを、店舗と娘の組ごとに1件にする。
 */
export const deduplicateRegularCards = <T extends RegularCardCandidate>(events: T[]): T[] => {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (event.category !== 'regular_card' || explicitTargetCharacters(event).length === 0) return true
    const key = regularCardKey(event)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
