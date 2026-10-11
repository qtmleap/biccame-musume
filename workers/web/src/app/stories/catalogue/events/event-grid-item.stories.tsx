import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '@/stories/ComponentExample'

const meta = {
  title: 'Components/events/event-grid-item',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventGridItem: Story = {
  args: { source: 'workers/web/src/app/components/events/event-grid-item.tsx', exportName: 'EventGridItem' },
  parameters: { catalogue: { sources: ['workers/web/src/app/components/events/event-grid-item.tsx#EventGridItem'] } }
}
