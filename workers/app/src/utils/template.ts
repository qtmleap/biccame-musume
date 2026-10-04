/**
 * `{key}` プレースホルダを vars の値で置換する
 */
export const formatTemplate = (template: string, vars: Record<string, string | number>): string => {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = vars[key]
    if (value === undefined) {
      throw new Error(`Missing template variable: ${key}`)
    }
    return String(value)
  })
}
