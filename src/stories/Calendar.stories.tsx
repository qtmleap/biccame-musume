import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { CalendarHeader, CalendarMonthDots, CalendarMonthTabs } from '@/components/calendar/calendar-controls'
import { CalendarEventList } from '@/components/calendar/calendar-event-list'
import { Button } from '@/components/ui/button'
import { calendarEvents } from './fixtures'

function CalendarPreview({ proposal = false, empty = false }: { proposal?: boolean; empty?: boolean }) {
  const [month, setMonth] = useState(10)
  return (
    <section className='mx-auto max-w-5xl'>
      <CalendarHeader
        year={2026}
        month={month}
        onPrevMonth={() => setMonth((m) => (m === 1 ? 12 : m - 1))}
        onNextMonth={() => setMonth((m) => (m === 12 ? 1 : m + 1))}
        onCurrentMonth={() => setMonth(10)}
      />
      {proposal ? (
        <fieldset className='flex min-w-0 gap-2 overflow-x-auto py-4' aria-label='表示する月'>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <Button
              key={m}
              size='sm'
              variant={m === month ? 'default' : 'outline'}
              aria-pressed={m === month}
              className='shrink-0 rounded-full'
              onClick={() => setMonth(m)}
            >
              {m}月
            </Button>
          ))}
        </fieldset>
      ) : (
        <>
          <CalendarMonthTabs selectedMonth={month} onSelectMonth={setMonth} />
          <CalendarMonthDots selectedMonth={month} onSelectMonth={setMonth} />
        </>
      )}
      <CalendarEventList year={2026} month={month} events={empty || month !== 10 ? [] : calendarEvents} />
      {proposal && (
        <p className='mt-4 text-sm text-muted-foreground'>月選択のみの改善案。店舗名の省略は現行部品で比較できます。</p>
      )}
    </section>
  )
}
const meta = {
  title: 'Review/Calendar',
  component: CalendarPreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '#61 月選択と店舗名。Currentは実コンポーネント、ProposalはStorybook限定の月選択案です。'
      }
    }
  }
} satisfies Meta<typeof CalendarPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Current: Story = {}
export const Boundary768: Story = { globals: { viewport: { value: '768', isRotated: false } } }
export const Narrow320: Story = { globals: { viewport: { value: '320', isRotated: false } } }
export const ProposedMonthLabels: Story = { args: { proposal: true } }
export const Empty: Story = { args: { empty: true } }
