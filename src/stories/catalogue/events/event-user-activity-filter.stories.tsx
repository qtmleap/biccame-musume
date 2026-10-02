import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/event-user-activity-filter',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventUserActivityFilter: Story = {
  args: { source: 'src/components/events/event-user-activity-filter.tsx', exportName: 'EventUserActivityFilter' },
  parameters: {
    catalogue: { sources: ['src/components/events/event-user-activity-filter.tsx#EventUserActivityFilter'] }
  }
}
