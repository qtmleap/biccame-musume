import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { SelectedStoreList } from '@/components/route/selected-store-list'
import { StoreSelect } from '@/components/route/store-select'
import type { SelectedStore } from '@/components/route/types'
import { Button } from '@/components/ui/button'

const stores: SelectedStore[] = [
  {
    lat: 34.6434,
    lng: 135.5116,
    id: 'abeno',
    name: 'あべのキューズモール店',
    station: '天王寺駅',
    stations: ['天王寺駅', '大阪阿部野橋駅']
  },
  { lat: 34.6667, lng: 135.5022, id: 'nanba', name: 'なんば店', station: 'なんば駅', stations: ['なんば駅'] },
  { lat: 34.8526, lng: 135.617, id: 'takatsuki', name: '高槻阪急スクエア店', station: '高槻駅', stations: ['高槻駅'] }
]
function RoutePreview({ initialCount = 0, guidance = true }: { initialCount?: number; guidance?: boolean }) {
  const [selected, setSelected] = useState(stores.slice(0, initialCount))
  const [done, setDone] = useState(false)
  const eligible = selected.length >= 2 && selected.every((s) => s.station)
  return (
    <section className='mx-auto max-w-2xl space-y-5'>
      <h1 className='text-2xl font-bold'>店舗の訪問順を計算</h1>
      {guidance && (
        <ol className='list-inside list-decimal space-y-2 text-sm'>
          <li>店舗を2〜5件選択</li>
          <li>利用駅を確認</li>
          <li>訪問順を計算</li>
        </ol>
      )}
      <StoreSelect
        stores={stores.filter((s) => !selected.some((v) => v.id === s.id))}
        onSelect={(id) => {
          const s = stores.find((s) => s.id === id)
          if (s) {
            setSelected((v) => [...v, s])
            setDone(false)
          }
        }}
      />
      <SelectedStoreList
        stores={selected}
        onRemove={(id) => {
          setSelected((v) => v.filter((s) => s.id !== id))
          setDone(false)
        }}
        onClearAll={() => {
          setSelected([])
          setDone(false)
        }}
        onChangeStation={(id, station) => {
          setSelected((v) => v.map((s) => (s.id === id ? { ...s, station } : s)))
          setDone(false)
        }}
      />
      {guidance && (
        <p id='route-help' role='status' className='text-sm text-muted-foreground'>
          {eligible
            ? '店舗と駅を確認して計算してください。'
            : `あと${Math.max(0, 2 - selected.length)}店舗選択してください。`}
        </p>
      )}
      <Button disabled={!eligible} aria-describedby={guidance ? 'route-help' : undefined} onClick={() => setDone(true)}>
        訪問順を計算（モック）
      </Button>
      {done && <p role='status'>モックの確認が完了しました。経路生成・AI通信は行いません。</p>}
    </section>
  )
}
const meta = {
  title: 'Review/Route',
  component: RoutePreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '#67 初期操作説明の改善案。店舗・駅選択は実コンポーネント。計算はローカル完了表示のみ。'
      }
    }
  }
} satisfies Meta<typeof RoutePreview>
export default meta
type Story = StoryObj<typeof meta>
export const Empty: Story = {}
export const OneStore: Story = { args: { initialCount: 1 } }
export const Ready: Story = { args: { initialCount: 2 } }
export const WithoutGuidance: Story = { args: { guidance: false } }
