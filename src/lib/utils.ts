import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Character } from '@/schemas/character.dto'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * キャラクターの画像URLを取得（4.pngを優先、なければ最初の画像）
 */
export const getCharacterImageUrl = (character: Character): string | undefined => {
  if (character.image_urls && character.image_urls.length > 0) {
    const images4 = character.image_urls.filter((url) => url.endsWith('4.png'))
    if (images4.length > 0) {
      return images4[images4.length - 1]
    }
    return character.image_urls[0]
  }
  return character.profile_image_url
}
