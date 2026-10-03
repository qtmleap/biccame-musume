import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/gantt-chart-parts',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const GanttMonthSelector: Story = {
  args: { source: 'workers/app/src/components/events/gantt-chart-parts.tsx', exportName: 'GanttMonthSelector' },
  parameters: { catalogue: { sources: ['workers/app/src/components/events/gantt-chart-parts.tsx#GanttMonthSelector'] } }
}
export const GanttDateHeader: Story = {
  args: { source: 'workers/app/src/components/events/gantt-chart-parts.tsx', exportName: 'GanttDateHeader' },
  parameters: { catalogue: { sources: ['workers/app/src/components/events/gantt-chart-parts.tsx#GanttDateHeader'] } }
}
export const GanttGridCell: Story = {
  args: { source: 'workers/app/src/components/events/gantt-chart-parts.tsx', exportName: 'GanttGridCell' },
  parameters: { catalogue: { sources: ['workers/app/src/components/events/gantt-chart-parts.tsx#GanttGridCell'] } }
}
