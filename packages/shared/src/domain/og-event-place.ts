import { CHARACTER_NAME_LABELS, STORE_NAME_LABELS } from '@biccame/shared/domain/character-names'
import { isSpecialCharacter, resolveEventCharacters } from '@biccame/shared/domain/event-character'
import { SPECIAL_CHARACTER_NAMES } from '@biccame/shared/domain/special-character-names'
import type { Event } from '@biccame/shared/schemas/event.dto'

// 1200px幅に収まる店舗数。超えた分は「ほか N 店舗」にまとめる
const MAX_LISTED_STORES = 3

export type EventOgPlace = {
  /** 画像に並べる開催店舗名 */
  stores: string[]
  /** 並べきれなかった開催店舗の数 */
  otherStoreCount: number
  /** 開催店舗の娘と異なる娘が対象のときだけ、その娘の名前 */
  character: string | null
}

/**
 * リンクカードに載せる開催店舗と対象の娘を決める。
 * 同じ題名のイベントが多数の店舗で開かれるため、どの店舗のものかを画像だけで判別できるようにする。
 */
export const eventOgPlace = (event: Pick<Event, 'stores' | 'characterIds'>): EventOgPlace => {
  const names = event.stores.map((store) => STORE_NAME_LABELS[store])
  const listed = names.length > MAX_LISTED_STORES ? names.slice(0, MAX_LISTED_STORES - 1) : names
  const targets = resolveEventCharacters(event).map((character) =>
    isSpecialCharacter(character) ? SPECIAL_CHARACTER_NAMES[character] : CHARACTER_NAME_LABELS[character]
  )
  return {
    stores: listed,
    otherStoreCount: names.length - listed.length,
    character: targets.length === 0 ? null : targets.join('・')
  }
}
