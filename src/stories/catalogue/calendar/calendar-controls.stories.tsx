import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/calendar/calendar-controls',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const CalendarHeader: Story = {
  args: { source: 'src/components/calendar/calendar-controls.tsx', exportName: 'CalendarHeader' },
  parameters: { catalogue: { sources: ['src/components/calendar/calendar-controls.tsx#CalendarHeader'] } }
}
export const CalendarMonthTabs: Story = {
  args: { source: 'src/components/calendar/calendar-controls.tsx', exportName: 'CalendarMonthTabs' },
  parameters: { catalogue: { sources: ['src/components/calendar/calendar-controls.tsx#CalendarMonthTabs'] } }
}
export const CalendarMonthDots: Story = {
  args: { source: 'src/components/calendar/calendar-controls.tsx', exportName: 'CalendarMonthDots' },
  parameters: { catalogue: { sources: ['src/components/calendar/calendar-controls.tsx#CalendarMonthDots'] } }
}
