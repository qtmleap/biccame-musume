import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * イベントの対象ビッカメ娘を解決する。
 * characterId が未指定のイベントは開催店舗と同じ娘が対象という扱い。
 * 閉店店舗の娘のイベントを別の娘が担当する場合にのみ characterId が設定される。
 */
export const resolveEventCharacter = (event: Pick<Event, 'characterId' | 'stores'>): StoreKey =>
  event.characterId ?? event.stores[0]
