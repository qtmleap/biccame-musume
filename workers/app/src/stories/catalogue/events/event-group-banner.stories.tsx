import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentExample } from '../../ComponentExample'

const meta = {
  title: 'Components/events/event-group-banner',
  component: ComponentExample,
  tags: ['autodocs'],
  parameters: { fixture: { authenticated: true } },
  argTypes: { source: { table: { disable: true } }, exportName: { table: { disable: true } } }
} satisfies Meta<typeof ComponentExample>
export default meta
type Story = StoryObj<typeof meta>
export const EventGroupBanner: Story = {
  args: { source: 'workers/app/src/components/events/event-group-banner.tsx', exportName: 'EventGroupBanner' },
  parameters: { catalogue: { sources: ['workers/app/src/components/events/event-group-banner.tsx#EventGroupBanner'] } }
}
