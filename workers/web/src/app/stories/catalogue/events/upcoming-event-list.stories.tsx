import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/events/upcoming-event-list',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const UpcomingEventList: Story = {
  args: { source: 'workers/web/src/app/components/events/upcoming-event-list.tsx', exportName: 'UpcomingEventList' },
  parameters: {
    catalogue: { sources: ['workers/web/src/app/components/events/upcoming-event-list.tsx#UpcomingEventList'] }
  }
}
