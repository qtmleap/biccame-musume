import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { StoreData } from '@/schemas/store.dto'

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs))
}

/**
 * キャラクターの画像URLを取得（4.pngを優先、なければ最初の画像）
 */
export const getCharacterImageUrl = (character: StoreData): string | undefined => {
  if (character.character?.images && character.character.images.length > 0) {
    const images4 = character.character.images.filter((url) => url.endsWith('4.png'))
    if (images4.length > 0) {
      return images4[images4.length - 1]
    }
    return character.character.images[0]
  }
  return undefined
}
