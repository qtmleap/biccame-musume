import { type SpecialCharacter, SpecialCharacterSchema } from '@biccame/shared/schemas/event.dto'

/**
 * 特殊な対象ビッカメ娘の表示名。投稿画像（shared）がサイトのバッジ表記と同じ文言を使うために置く。
 * アプリ側の辞書（store-character-labels.ts の special_character）と同じ値で、__tests__/utils/social-post.test.ts が一致を検査する。
 */
export const SPECIAL_CHARACTER_NAMES: Record<SpecialCharacter, string> = {
  [SpecialCharacterSchema.enum.other]: 'その他',
  [SpecialCharacterSchema.enum.secret]: 'シークレット'
}
