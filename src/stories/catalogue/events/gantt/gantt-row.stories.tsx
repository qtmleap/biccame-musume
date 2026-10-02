import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../../ComponentExample'

const meta = {
  title: 'Components/events/gantt/gantt-row',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const GanttRow: Story = {
  args: { source: 'src/components/events/gantt/gantt-row.tsx', exportName: 'GanttRow' },
  parameters: { catalogue: { sources: ['src/components/events/gantt/gantt-row.tsx#GanttRow'] } }
}
