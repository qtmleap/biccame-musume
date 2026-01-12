import { type ClassValue, clsx } from 'clsx'
import { isPlainObject, mapValues } from 'lodash-es'
import { twMerge } from 'tailwind-merge'
import type { StoreData } from '@/schemas/store.dto'

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs))
}

/**
 * nullをundefinedに変換するヘルパー関数（再帰的）
 * DBから返ってきたnull値をアプリケーション層のundefinedに変換
 * ネストしたオブジェクトや配列にも対応
 */
export const nullToUndefined = <T>(obj: T): T => {
  if (obj === null) {
    return undefined as T
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => nullToUndefined(item)) as T
  }

  if (isPlainObject(obj)) {
    return mapValues(obj, (value) => nullToUndefined(value)) as T
  }

  return obj
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
