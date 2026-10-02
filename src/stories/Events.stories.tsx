import type { Meta, StoryObj } from '@storybook/react-vite'
import { atom, useAtomValue } from 'jotai'
import { useState } from 'react'
import { categoryFilterAtom } from '@/atoms/category-filter-atom'
import { EventCategoryFilter } from '@/components/events/event-category-filter'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { EventGridItem } from '@/components/events/event-grid-item'
import { EventStatusFilter } from '@/components/events/event-status-filter'
import { EventListItem } from '@/components/home/event-list-item'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { events } from './fixtures'

const statusAtom = atom({ upcoming: true, ongoing: true, ended: false })
function FilterPreview() {
  const [open, setOpen] = useState(true)
  const categories = useAtomValue(categoryFilterAtom)
  const statuses = useAtomValue(statusAtom)
  const visible = events.filter(
    (e) => categories.has(e.category) && statuses[e.status === 'last_day' ? 'ongoing' : e.status]
  )
  const controls = (
    <div className='space-y-5'>
      <EventCategoryFilter />
      <EventStatusFilter statusFilterAtom={statusAtom} />
    </div>
  )
  return (
    <section className='mx-auto max-w-5xl space-y-6'>
      <div className='flex items-center justify-between gap-2'>
        <h2 className='text-xl font-bold'>イベント一覧（{visible.length}件）</h2>
        <Button variant='outline' onClick={() => setOpen(true)}>
          条件を変更
        </Button>
      </div>
      <div className='hidden md:block'>{!open && controls}</div>
      <div className='grid gap-4 md:grid-cols-2'>
        {visible.map((e, index) => (
          <EventGridItem key={e.uuid} event={e} index={index} />
        ))}
      </div>
      {!visible.length && <p role='status'>該当するイベントはありません。条件を変更してください。</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-h-[85vh] overflow-y-auto'>
          <DialogTitle>イベントを絞り込む（改善案モック）</DialogTitle>
          {open && controls}
          <Button onClick={() => setOpen(false)}>{visible.length}件を表示</Button>
        </DialogContent>
      </Dialog>
    </section>
  )
}
function EventsPreview({
  mode = 'grid'
}: {
  mode?: 'grid' | 'home' | 'gantt' | 'filter' | 'empty' | 'loading' | 'error'
}) {
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
        <Button onClick={() => setRetrying(true)}>再試行（モック）</Button>
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
          '#59/#60/#66。カードと日程表は実コンポーネント。フィルター完了導線と取得状態はStorybook限定モックです。'
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
