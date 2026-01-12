import { mapValues } from 'lodash-es'

export const nullToUndefined = <T extends Record<string, any>>(
  obj: T
): {
  [K in keyof T]: T[K] extends null ? undefined : T[K]
} => {
  return mapValues(obj, (v) => (v === null ? undefined : v)) as any
}
