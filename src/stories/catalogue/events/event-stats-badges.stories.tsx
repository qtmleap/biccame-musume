import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/event-stats-badges',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventStatsBadges: Story = {
  args: { source: 'src/components/events/event-stats-badges.tsx', exportName: 'EventStatsBadges' },
  parameters: { catalogue: { sources: ['src/components/events/event-stats-badges.tsx#EventStatsBadges'] } }
}
