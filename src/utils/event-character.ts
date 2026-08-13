import { type Event, type EventCharacter, type SpecialCharacter, SpecialCharacterSchema } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

/**
 * 対象ビッカメ娘が「その他」「シークレット」のような特殊値かどうか。
 * 特殊値のイベントはどの娘にも紐付かない扱いになる
 */
export const isSpecialCharacter = (character: EventCharacter): character is SpecialCharacter =>
  SpecialCharacterSchema.safeParse(character).success

/**
 * イベントの対象ビッカメ娘を解決する。
 * characterId が未指定のイベントは開催店舗と同じ娘が対象という扱い。
 * 閉店店舗の娘のイベントを別の娘が担当する場合や、
 * 特定の娘に紐付かない場合（other / secret）にのみ characterId が設定される。
 */
export const resolveEventCharacter = (event: Pick<Event, 'characterId' | 'stores'>): EventCharacter =>
  event.characterId ?? event.stores[0]

/**
 * イベントが指定の娘に紐付くかどうか。特殊値のイベントはどの娘にも紐付かない
 */
export const isEventForCharacter = (event: Pick<Event, 'characterId' | 'stores'>, storeKey: StoreKey): boolean =>
  resolveEventCharacter(event) === storeKey
