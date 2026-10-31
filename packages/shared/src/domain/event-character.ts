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

/**
 * 同じ企画をまとめたり重複を除いたりするキーに使う、明示された対象の娘。重複なし・昇順。
 * 娘の集合が開催店舗の集合とちょうど同じなら、バックフィルで入れた既定（店舗の娘そのもの）なので、娘が空のイベントと
 * 同じに見て空配列を返す。そうでなければ characterIds をそのまま返す（自店舗の娘が混ざっていても引かない。
 * 店舗の娘に別の娘を足した共同デザインは、別の娘だけの名刺と区別される。開催店舗の一部だけの明示も、バックフィル前と同じキーのまま）。
 * 表示するラベルや立ち絵は変えない。
 */
export const explicitTargetCharacters = (event: {
  stores: readonly StoreKey[]
  characterIds: readonly EventCharacter[]
}): EventCharacter[] => {
  const characters = [...new Set(event.characterIds)].toSorted()
  const stores = new Set<string>(event.stores)
  const isDefault = characters.length === stores.size && characters.every((character) => stores.has(character))
  return isDefault ? [] : characters
}
