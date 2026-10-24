import { quantile, type Rate, rate } from './d1-gold-score'

// 確認の「はい」の確率に掛けるしきい値。
export const CONFIRM_THRESHOLDS = [0.9, 0.8, 0.7, 0.5] as const

export type Spread = {
  n: number
  min: number | null
  q1: number | null
  median: number | null
  q3: number | null
  max: number | null
}

export const spreadOf = (values: readonly number[]): Spread => ({
  n: values.length,
  min: quantile(values, 0),
  q1: quantile(values, 0.25),
  median: quantile(values, 0.5),
  q3: quantile(values, 0.75),
  max: quantile(values, 1)
})

export const passRates = (values: readonly number[]): Rate[] =>
  CONFIRM_THRESHOLDS.map((threshold) => rate(values.filter((value) => value >= threshold).length, values.length))

export const percent = (value: number | null, digits = 1) =>
  value === null ? '-' : `${(value * 100).toFixed(digits)}%`
export const rateText = (value: Rate) =>
  value.rate === null ? '-' : `${(value.rate * 100).toFixed(0)}% (${value.n}/${value.d})`

// 分布 1 行: ラベル、件数、最小・四分位・中央値・最大、しきい値ごとの通過率。
export const distributionRow = (label: string, values: readonly number[]): string[] => {
  const spread = spreadOf(values)
  return [
    label,
    String(spread.n),
    percent(spread.min),
    percent(spread.q1),
    percent(spread.median),
    percent(spread.q3),
    percent(spread.max),
    ...passRates(values).map(rateText)
  ]
}

export const DISTRIBUTION_HEADER = [
  'group',
  'n',
  'min',
  'q1',
  'median',
  'q3',
  'max',
  ...CONFIRM_THRESHOLDS.map((threshold) => `>=${Math.round(threshold * 100)}%`)
]

// 列をそろえた表（等幅の文字列）。
export const renderTable = (header: readonly string[], rows: readonly (readonly string[])[]) => {
  const widths = header.map((cell, column) =>
    Math.max(Array.from(cell).length, ...rows.map((row) => Array.from(row[column]).length))
  )
  const line = (cells: readonly string[]) =>
    cells.map((cell, column) => cell + ' '.repeat(widths[column] - Array.from(cell).length)).join(' | ')
  return [line(header), widths.map((width) => '-'.repeat(width)).join('-|-'), ...rows.map(line)].join('\n')
}

export const meanOf = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
