import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CHART_COLOR, HistogramChart, MonthlyChart, StoreChart } from '@/components/admin/event-detect/charts'
import { storeName } from '@/components/admin/event-detect/constants'
import { SectionHeading } from '@/components/admin/event-detect/section'
import { useEventDetectCharts } from '@/hooks/use-event-detect'

/** グラフの小見出し。LLM 確率の候補と D1 参考投稿のように、並べたグラフの名前に使う（呼び名は統計画面の列と同じ） */
const ChartName = ({ children }: { children: string }) => (
  <h3 className='mb-2 text-sm font-medium text-muted-foreground'>{children}</h3>
)

const ChartsPage = () => {
  const { data } = useEventDetectCharts()
  const navigate = useNavigate()
  // 棒の件数と一覧の件数を一致させるため、範囲（通過 = イベント候補）と「同一文面をまとめる」を明示して投稿一覧へ移る。
  // 投稿画面の既定（未ラベルのみ・同一文面をまとめる）だと、棒より少なく出てしまう
  const openPosts = (judge: 'llm' | 'clef', bin: number, scope: 'passed' | 'gold') =>
    navigate({ to: '/admin/event-detect/posts', search: { scope, dedup: false, judge, bin } })
  const stores = data.stores.map((entry) => ({ name: storeName(entry.store), count: entry.count }))

  return (
    <div>
      <SectionHeading>LLM 確率</SectionHeading>
      {/* 候補と D1 参考投稿は件数の桁が違うので、同じ軸に載せず別々のグラフにする */}
      <div className='grid grid-cols-2 gap-6'>
        <div>
          <ChartName>候補</ChartName>
          <HistogramChart
            bins={data.llmProbability.all}
            color={CHART_COLOR.primary}
            onSelect={(bin) => openPosts('llm', bin, 'passed')}
          />
        </div>
        <div>
          <ChartName>D1 参考投稿</ChartName>
          <HistogramChart
            bins={data.llmProbability.gold}
            color={CHART_COLOR.secondary}
            onSelect={(bin) => openPosts('llm', bin, 'gold')}
          />
        </div>
      </div>

      <SectionHeading>Clef 確率</SectionHeading>
      <HistogramChart
        bins={data.clefProbability}
        color={CHART_COLOR.primary}
        onSelect={(bin) => openPosts('clef', bin, 'passed')}
      />

      <SectionHeading>月別イベント数</SectionHeading>
      <MonthlyChart
        rows={data.monthlyEvents}
        series={[
          { key: 'llm', label: 'LLM', color: CHART_COLOR.primary },
          { key: 'llmEnded', label: '終了', color: CHART_COLOR.secondary },
          { key: 'd1', label: 'D1', color: CHART_COLOR.tertiary }
        ]}
      />

      <SectionHeading>月別投稿数</SectionHeading>
      <MonthlyChart
        rows={data.monthlyPosts}
        series={[
          { key: 'posts', label: '全体', color: CHART_COLOR.primary },
          { key: 'candidates', label: '候補', color: CHART_COLOR.secondary, axis: 'right' }
        ]}
      />

      <SectionHeading>店舗別イベント数（LLM）</SectionHeading>
      <StoreChart stores={stores} color={CHART_COLOR.primary} />
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/charts/')({
  component: ChartsPage
})
