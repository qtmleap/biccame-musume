import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts'
import { formatNumber } from '@/components/admin/event-detect/format'
import { EmptyState } from '@/components/admin/event-detect/section'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'

// イベント検出ビューワのチャート。色はテーマの --chart-* を使い、ライト・ダークとも読めるようにする。
// 軸の数字は等幅（tabular-nums）。画面に出す文字は見出し・軸の目盛り・凡例の系列名・ツールチップの数値だけ。

/** 系列の色。ChartContainer が --color-<key> に差し替えるので、描画側は var(--color-<key>) で参照する */
export const CHART_COLOR = {
  primary: 'var(--chart-1)',
  secondary: 'var(--chart-2)',
  tertiary: 'var(--chart-3)'
} as const

const NO_DATA = 'データなし'

/** 数値の目盛り・ラベル。千の位に区切りを入れる */
const tickNumber = (value: unknown): string => (typeof value === 'number' ? formatNumber(value) : String(value))

/** 棒の上や横に出す件数。0 は出さない */
const barLabel = (value: unknown): string => (typeof value === 'number' && value > 0 ? formatNumber(value) : '')

type HistogramBin = { label: string; count: number }

/**
 * 確率のヒストグラム。件数が全区間で 0 ならデータなし。
 * onSelect があれば、棒のある区間をクリックしたときに区間番号（bins の添字）を渡す。クリックは棒の上だけでなく
 * 区間の全高で受けるので、高さが 0 に近い棒も押せる。件数が 0 の区間は渡さない。
 */
export const HistogramChart = ({
  bins,
  color,
  onSelect
}: {
  bins: readonly HistogramBin[]
  color: string
  onSelect?: (bin: number) => void
}) => {
  if (bins.every((bin) => bin.count === 0)) return <EmptyState>{NO_DATA}</EmptyState>
  const config = { count: { label: '件数', color } } satisfies ChartConfig
  return (
    <ChartContainer
      config={config}
      className={cn('aspect-auto h-64 w-full tabular-nums', onSelect && 'cursor-pointer')}
    >
      <BarChart
        data={[...bins]}
        margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
        onClick={(state) => {
          // recharts 3 は区間番号を "9" のような文字列で渡す（型は number | string）ので、数値にしてから使う
          const index = Number(state.activeTooltipIndex)
          if (onSelect === undefined || state.activeTooltipIndex == null || !Number.isInteger(index)) return
          const bin = bins[index]
          if (bin !== undefined && bin.count > 0) onSelect(index)
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey='label' tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 11 }} />
        <YAxis width='auto' tickLine={false} axisLine={false} tickFormatter={tickNumber} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey='count' fill='var(--color-count)' radius={[3, 3, 0, 0]}>
          <LabelList dataKey='count' position='top' formatter={barLabel} className='fill-foreground' />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

type MonthlySeries = {
  key: string
  label: string
  color: string
  /** 縦軸。桁が違う系列は右の軸に載せる。省略は左 */
  axis?: 'left' | 'right'
}

type MonthlyRow = Record<string, string | number>

/**
 * 月別の折れ線。x 軸は YYYY-MM で、重ならないよう目盛りを間引く。
 * 右の軸に載せる系列があるときは、軸の線をその系列の色にして対応を示す。
 */
export const MonthlyChart = ({ rows, series }: { rows: readonly MonthlyRow[]; series: readonly MonthlySeries[] }) => {
  const hasData = rows.some((row) => series.some((entry) => Number(row[entry.key]) > 0))
  if (!hasData) return <EmptyState>{NO_DATA}</EmptyState>
  const config = Object.fromEntries(series.map((entry) => [entry.key, { label: entry.label, color: entry.color }]))
  const right = series.find((entry) => entry.axis === 'right')
  const left = series.find((entry) => entry.axis !== 'right')
  const dual = right !== undefined && left !== undefined
  return (
    <ChartContainer config={config} className='aspect-auto h-72 w-full tabular-nums'>
      <LineChart data={[...rows]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey='month'
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval='preserveStartEnd'
          minTickGap={24}
        />
        <YAxis
          yAxisId='left'
          width='auto'
          tickLine={false}
          axisLine={dual ? { stroke: `var(--color-${left.key})` } : false}
          tickFormatter={tickNumber}
        />
        {dual && (
          <YAxis
            yAxisId='right'
            orientation='right'
            width='auto'
            tickLine={false}
            axisLine={{ stroke: `var(--color-${right.key})` }}
            tickFormatter={tickNumber}
          />
        )}
        <ChartTooltip content={<ChartTooltipContent />} />
        {/* 既定は名前順に並べ替えるので、統計画面の列と同じ系列の並びで出すよう null にする */}
        <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
        {series.map((entry) => (
          <Line
            key={entry.key}
            yAxisId={entry.axis === 'right' ? 'right' : 'left'}
            dataKey={entry.key}
            type='monotone'
            stroke={`var(--color-${entry.key})`}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}

type StoreBar = { name: string; count: number }

/** 1 本あたりの高さ（px）と、軸・余白の分 */
const STORE_ROW_HEIGHT = 28
const STORE_CHART_PADDING = 16

/** 店舗別の横棒。上から件数の降順で、本数に応じて高さを変える */
export const StoreChart = ({ stores, color }: { stores: readonly StoreBar[]; color: string }) => {
  if (stores.length === 0) return <EmptyState>{NO_DATA}</EmptyState>
  const config = { count: { label: 'LLM', color } } satisfies ChartConfig
  return (
    <ChartContainer
      config={config}
      className='aspect-auto w-full tabular-nums'
      style={{ height: stores.length * STORE_ROW_HEIGHT + STORE_CHART_PADDING }}
    >
      <BarChart data={[...stores]} layout='vertical' margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} />
        <YAxis dataKey='name' type='category' width='auto' tickLine={false} axisLine={false} interval={0} />
        <XAxis type='number' hide />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey='count' fill='var(--color-count)' radius={[0, 3, 3, 0]}>
          <LabelList dataKey='count' position='right' formatter={barLabel} className='fill-foreground' />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
