import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/event-stats-animations',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const HeartBurstOverlay: Story = {
  args: { source: 'src/components/events/event-stats-animations.tsx', exportName: 'HeartBurstOverlay' },
  parameters: { catalogue: { sources: ['src/components/events/event-stats-animations.tsx#HeartBurstOverlay'] } }
}
export const FireworkBurstOverlay: Story = {
  args: { source: 'src/components/events/event-stats-animations.tsx', exportName: 'FireworkBurstOverlay' },
  parameters: { catalogue: { sources: ['src/components/events/event-stats-animations.tsx#FireworkBurstOverlay'] } }
}
