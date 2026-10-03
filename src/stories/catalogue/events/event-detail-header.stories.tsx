import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/event-detail-header',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventDetailHeader: Story = {
  args: { source: 'src/components/events/event-detail-header.tsx', exportName: 'EventDetailHeader' },
  parameters: { catalogue: { sources: ['src/components/events/event-detail-header.tsx#EventDetailHeader'] } }
}
