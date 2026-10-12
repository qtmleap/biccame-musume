import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { EventGridItem } from '@/components/events/event-grid-item'
import { EventListItem } from '@/components/home/event-list-item'
import { Button } from '@/components/ui/button'
import { events } from '@/stories/fixtures'
import { PageExample } from '@/stories/PageExample'

const FilterPreview = () => (
  <div className='-m-4 md:-m-8'>
    <PageExample path='/events/' />
  </div>
)
const EventsPreview = ({
  mode = 'grid'
}: {
  mode?: 'grid' | 'home' | 'gantt' | 'filter' | 'empty' | 'loading' | 'error'
}) => {
  const [retrying, setRetrying] = useState(false)
  if (mode === 'filter') return <FilterPreview />
  if (mode === 'empty')
    return (
      <p role='status' className='py-12 text-center'>
        該当するイベントはありません
      </p>
    )
  if (mode === 'loading' || retrying)
    return (
      <div role='status' aria-label='読み込み中' className='space-y-4'>
        {[1, 2, 3].map((n) => (
          <div key={n} className='h-28 animate-pulse rounded-xl bg-muted' />
        ))}
        <p>読み込み中…</p>
      </div>
    )
  if (mode === 'error')
    return (
      <div role='alert' className='space-y-4'>
        <p>イベントを取得できませんでした。</p>
        <Button className='bg-brand hover:bg-brand/90 text-brand-foreground' onClick={() => setRetrying(true)}>
          再試行（モック）
        </Button>
      </div>
    )
  if (mode === 'gantt') return <EventGanttChart events={events} />
  return (
    <div className='mx-auto grid max-w-5xl gap-5 md:grid-cols-2'>
      {events.map((e, index) =>
        mode === 'home' ? (
          <EventListItem key={e.uuid} event={e} index={index} />
        ) : (
          <EventGridItem key={e.uuid} event={e} index={index} />
        )
      )}
    </div>
  )
}
const meta = {
  title: 'Review/Events',
  component: EventsPreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'カードと日程表は実コンポーネント。ProposedFilterは現行イベントページの絞り込みを表示します。取得状態はStorybook限定モックです。'
      }
    }
  }
} satisfies Meta<typeof EventsPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Cards: Story = {}
export const HomeLongTitles: Story = { args: { mode: 'home' } }
export const Gantt: Story = { args: { mode: 'gantt' } }
export const ProposedFilter: Story = { args: { mode: 'filter' } }
export const Empty: Story = { args: { mode: 'empty' } }
export const Loading: Story = { args: { mode: 'loading' } }
export const FailedToLoad: Story = { args: { mode: 'error' } }
