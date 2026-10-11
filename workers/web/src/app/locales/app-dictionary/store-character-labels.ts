import { STORE_DISPLAY_NAMES } from '@biccame/shared/domain/badges/store-display-names'
import { CHARACTER_NAME_LABELS } from '@biccame/shared/domain/character-names'
import { SpecialCharacterSchema } from '@biccame/shared/schemas/event.dto'

export const storeCharacterContent = {
  // バッジと辞書で店名がずれないよう、バッジ側の定義を唯一の定義元にする。
  store_name: STORE_DISPLAY_NAMES,
  character_name: CHARACTER_NAME_LABELS,
  special_character: {
    [SpecialCharacterSchema.enum.other]: 'その他',
    [SpecialCharacterSchema.enum.secret]: 'シークレット'
  }
}
