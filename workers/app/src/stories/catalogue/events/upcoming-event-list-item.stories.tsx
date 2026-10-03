import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/upcoming-event-list-item',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const UpcomingEventListItem: Story = {
  args: {
    source: 'workers/app/src/components/events/upcoming-event-list-item.tsx',
    exportName: 'UpcomingEventListItem'
  },
  parameters: {
    catalogue: { sources: ['workers/app/src/components/events/upcoming-event-list-item.tsx#UpcomingEventListItem'] }
  }
}
