import { type ClassValue, clsx } from 'clsx'
import { isPlainObject, mapValues } from 'lodash-es'
import { twMerge } from 'tailwind-merge'

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
