import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/event-character-badge',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventCharacterBadge: Story = {
  args: { source: 'src/components/events/event-character-badge.tsx', exportName: 'EventCharacterBadge' },
  parameters: { catalogue: { sources: ['src/components/events/event-character-badge.tsx#EventCharacterBadge'] } }
}
