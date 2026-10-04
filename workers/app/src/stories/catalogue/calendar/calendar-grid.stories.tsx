import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/calendar/calendar-grid',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CalendarGrid: Story = {
  args: { source: 'workers/app/src/components/calendar/calendar-grid.tsx', exportName: 'CalendarGrid' },
  parameters: { catalogue: { sources: ['workers/app/src/components/calendar/calendar-grid.tsx#CalendarGrid'] } }
}
