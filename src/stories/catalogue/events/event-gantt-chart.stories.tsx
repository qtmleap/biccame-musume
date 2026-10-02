import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/event-gantt-chart',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventGanttChart: Story = {
  args: { source: 'src/components/events/event-gantt-chart.tsx', exportName: 'EventGanttChart' },
  parameters: { catalogue: { sources: ['src/components/events/event-gantt-chart.tsx#EventGanttChart'] } }
}
