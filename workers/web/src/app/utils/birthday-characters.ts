import { isBirthdayToday } from '@biccame/shared/domain/character'
import type { StoreData } from '@biccame/shared/schemas/store.dto'

/**
 * 今日が誕生日のキャラクターを取得
 * 開発環境では指定されたキャラクターID（アンダーバー区切りで複数指定可）を使用
 */
export const getBirthdayCharacters = (characters: StoreData[], devCharacterId?: string): StoreData[] => {
  if (import.meta.env.DEV && devCharacterId) {
    const ids = devCharacterId.split('_')
    return characters.filter((c) => ids.includes(c.id))
  }
  if (import.meta.env.DEV) {
    const kyoto = characters.find((character) => character.id === 'kyoto')
    return kyoto ? [kyoto] : []
  }
  return characters.filter((character) => isBirthdayToday(character.character?.birthday))
}
