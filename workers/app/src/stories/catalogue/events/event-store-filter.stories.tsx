import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/event-store-filter',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventStoreFilter: Story = {
  args: { source: 'workers/app/src/components/events/event-store-filter.tsx', exportName: 'EventStoreFilter' },
  parameters: { catalogue: { sources: ['workers/app/src/components/events/event-store-filter.tsx#EventStoreFilter'] } }
}
