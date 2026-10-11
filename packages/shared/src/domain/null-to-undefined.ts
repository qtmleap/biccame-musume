import { isPlainObject, mapValues } from 'lodash-es'

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
