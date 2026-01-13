import { mapValues } from 'lodash-es'

// biome-ignore lint/suspicious/noExplicitAny: ジェネリック型の制約として必要
export const nullToUndefined = <T extends Record<string, any>>(
  obj: T
): {
  [K in keyof T]: T[K] extends null ? undefined : T[K]
} => {
  // biome-ignore lint/suspicious/noExplicitAny: 型変換のため必要
  return mapValues(obj, (v) => (v === null ? undefined : v)) as any
}
