import type { Meta, StoryObj } from '@storybook/react-vite'
import { CalendarEventList } from '@/components/calendar/calendar-event-list'
import { PageExample } from './PageExample'

const CalendarPreview = ({ empty = false }: { empty?: boolean }) =>
  empty ? (
    <CalendarEventList year={2026} month={10} events={[]} />
  ) : (
    <div className='-m-4 md:-m-8'>
      <PageExample path='/calendar/' />
    </div>
  )

const meta = {
  title: 'Review/Calendar',
  component: CalendarPreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '現行カレンダーページを表示します。768px以下は一覧、769px以上はグリッドです。日付・周年は合成データです。Emptyは一覧部品だけの空状態です。'
      }
    }
  }
} satisfies Meta<typeof CalendarPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Current: Story = {}
export const Boundary768: Story = { globals: { viewport: { value: '768', isRotated: false } } }
export const Boundary769: Story = { globals: { viewport: { value: '769', isRotated: false } } }
export const Narrow320: Story = { globals: { viewport: { value: '320', isRotated: false } } }
export const Empty: Story = {
  args: { empty: true },
  parameters: { docs: { description: { story: 'CalendarEventListの空状態です。ページ全体の空状態ではありません。' } } }
}
