import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/admin/event-card',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventCard: Story = {
  args: { source: 'src/components/admin/event-card.tsx', exportName: 'EventCard' },
  parameters: { catalogue: { sources: ['src/components/admin/event-card.tsx#EventCard'] } }
}
