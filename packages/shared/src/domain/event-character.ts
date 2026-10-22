import {
  type Event,
  type EventCharacter,
  type SpecialCharacter,
  SpecialCharacterSchema
} from '@biccame/shared/schemas/event.dto'
import type { StoreKey } from '@biccame/shared/schemas/store.dto'

/** 特殊値は特定のビッカメ娘には紐付かない。 */
export const isSpecialCharacter = (character: EventCharacter): character is SpecialCharacter =>
  SpecialCharacterSchema.safeParse(character).success

/** 開催店舗と対象ビッカメ娘は独立しており、空配列を店舗から補完しない。 */
export const resolveEventCharacters = (event: Pick<Event, 'characterIds'>): EventCharacter[] => event.characterIds

/** 単一の代表画像が必要な箇所向け。対象未判定なら undefined。 */
export const resolveEventCharacter = (event: Pick<Event, 'characterIds'>): EventCharacter | undefined =>
  event.characterIds[0]

export const isEventForCharacter = (event: Pick<Event, 'characterIds'>, storeKey: StoreKey): boolean =>
  event.characterIds.includes(storeKey)
